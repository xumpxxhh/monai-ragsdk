import type { Chunk, Vector } from '@monai-ragsdk/core';
import type { Embedder } from '@monai-ragsdk/indexing';

import { postOllamaJson, type FetchLike, type OllamaHttpOptions } from '../shared/http.js';

export type OllamaEmbedderOptions = OllamaHttpOptions & {
  model: string;
  baseUrl?: string;
  dimension: number;
  batchSize?: number;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  embedding?: number[];
};

/** 按 Ollama /api/embed 生成向量；缺维度或不对齐时立即失败，避免写入错向量。 */
export class OllamaEmbedder implements Embedder {
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #dimension: number;
  readonly #batchSize: number;
  readonly #http: OllamaHttpOptions;

  constructor(options: OllamaEmbedderOptions) {
    this.#model = options.model;
    this.#baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.#dimension = options.dimension;
    this.#batchSize = options.batchSize ?? 32;
    this.#http = {
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
      fetch: options.fetch,
    };

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
      const payload = await postOllamaJson<OllamaEmbedResponse>(
        `${this.#baseUrl}/api/embed`,
        {
          model: this.#model,
          input: batch.map((chunk) => chunk.content),
        },
        this.#http,
      );
      const embeddings = payload.embeddings ?? readSingleEmbedding(payload);

      if (embeddings.length !== batch.length) {
        throw new Error(
          `Ollama returned ${embeddings.length} embeddings for ${batch.length} chunks`,
        );
      }

      for (const [index, chunk] of batch.entries()) {
        const values = embeddings[index];

        if (!values || values.length !== this.#dimension) {
          throw new Error(
            `Ollama embedding dimension mismatch for ${chunk.id}: expected ${this.#dimension}, received ${values?.length ?? 0}`,
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

function readSingleEmbedding(payload: OllamaEmbedResponse): number[][] {
  return payload.embedding ? [payload.embedding] : [];
}

export type { FetchLike };
