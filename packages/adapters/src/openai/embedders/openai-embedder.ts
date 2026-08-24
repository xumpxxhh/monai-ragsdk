import type { Chunk, Vector } from '@monai-ragsdk/core';
import type { Embedder } from '@monai-ragsdk/indexing';

import { createOpenAIClient, type OpenAIClientOptions } from '../shared/create-openai-client.js';

export type OpenAIEmbedderOptions = Omit<OpenAIClientOptions, 'apiKey'> & {
  model: string;
  apiKey?: string;
  dimension: number;
  batchSize?: number;
};

type EmbeddingItem = {
  embedding?: number[];
  index?: number;
};

/** embedding 只读 EMBEDDING_API_KEY，避免和 ask 的 OPENAI_API_KEY 混用。 */
function resolveApiKey(apiKey?: string): string | undefined {
  return apiKey || process.env.EMBEDDING_API_KEY;
}

/**
 * 按 OpenAI 兼容 /embeddings 写入向量；缺 key、baseUrl 或维度不一致时立即失败。
 * HTTP 走官方 SDK，batch / 维度 / index 对齐仍由本类负责。
 */
export class OpenAIEmbedder implements Embedder {
  readonly #model: string;
  readonly #dimension: number;
  readonly #batchSize: number;
  readonly #sdk: ReturnType<typeof createOpenAIClient>;

  constructor(options: OpenAIEmbedderOptions) {
    const apiKey = resolveApiKey(options.apiKey);

    if (!apiKey) {
      throw new Error('OpenAIEmbedder requires apiKey, or EMBEDDING_API_KEY');
    }

    const baseUrl = options.baseUrl.trim();

    if (!baseUrl) {
      throw new Error('OpenAIEmbedder requires baseUrl');
    }

    this.#model = options.model;
    this.#dimension = options.dimension;
    this.#batchSize = options.batchSize ?? 32;
    this.#sdk = createOpenAIClient({
      apiKey,
      baseUrl,
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      maxRetries: options.maxRetries,
      retryDelayMs: options.retryDelayMs,
      fetch: options.fetch,
    });

    if (this.#dimension <= 0) {
      throw new Error('dimension must be greater than 0');
    }

    if (this.#batchSize <= 0) {
      throw new Error('batchSize must be greater than 0');
    }
  }

  async embed(chunks: Chunk[]): Promise<Vector[]> {
    if (chunks.length === 0) {
      return [];
    }

    const vectors: Vector[] = [];

    for (let start = 0; start < chunks.length; start += this.#batchSize) {
      const batch = chunks.slice(start, start + this.#batchSize);
      // 显式 float：SDK 默认 base64，兼容网关常直接回 number[]，避免解码成空向量
      const payload = await this.#sdk.embeddings.create({
        model: this.#model,
        input: batch.map((chunk) => chunk.content),
        encoding_format: 'float',
      });
      const embeddings = readEmbeddings(payload.data, batch.length);

      for (const [index, chunk] of batch.entries()) {
        const values = embeddings[index];

        if (!values || values.length !== this.#dimension) {
          throw new Error(
            `OpenAI embedding dimension mismatch for ${chunk.id}: expected ${this.#dimension}, received ${values?.length ?? 0}`,
          );
        }

        vectors.push({
          id: chunk.id,
          values,
          metadata: chunk.metadata,
        });
      }
    }

    return vectors;
  }
}

/** 兼容接口可能乱序返回，必须按 index 对齐到当前 batch。 */
function readEmbeddings(items: EmbeddingItem[], expectedCount: number): number[][] {
  if (items.length !== expectedCount) {
    throw new Error(`OpenAI returned ${items.length} embeddings for ${expectedCount} chunks`);
  }

  const embeddings: number[][] = Array.from({ length: expectedCount });

  for (const [fallbackIndex, item] of items.entries()) {
    const index = item.index ?? fallbackIndex;

    if (index < 0 || index >= expectedCount) {
      throw new Error(
        `OpenAI returned embedding index ${index} outside batch size ${expectedCount}`,
      );
    }

    if (embeddings[index]) {
      throw new Error(`OpenAI returned duplicate embedding index ${index}`);
    }

    if (!item.embedding) {
      throw new Error(`OpenAI returned empty embedding at index ${index}`);
    }

    embeddings[index] = item.embedding;
  }

  return embeddings;
}
