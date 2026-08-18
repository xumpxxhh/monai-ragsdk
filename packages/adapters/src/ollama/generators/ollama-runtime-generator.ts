import type {
  RuntimeGenerationResult,
  RuntimeGenerationStreamEvent,
  RuntimeGenerator,
  RuntimeGeneratorInput,
} from '@monai-ragsdk/runtime';

import { postOllamaJson, postOllamaNdjson, type OllamaHttpOptions } from '../shared/http.js';

export type OllamaRuntimeGeneratorOptions = OllamaHttpOptions & {
  model: string;
  baseUrl?: string;
  systemPrompt?: string;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  response?: string;
};

/** 按 Ollama /api/chat 生成答案；优先消费 runtime 的 promptContext。 */
export class OllamaRuntimeGenerator implements RuntimeGenerator {
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #systemPrompt: string;
  readonly #http: OllamaHttpOptions;

  constructor(options: OllamaRuntimeGeneratorOptions) {
    this.#model = options.model;
    this.#baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.#systemPrompt =
      options.systemPrompt ??
      '只根据提供的上下文回答问题。如果上下文不足以回答，就明确说明无法判断。';
    this.#http = {
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
      fetch: options.fetch,
    };
  }

  async generate(input: RuntimeGeneratorInput): Promise<RuntimeGenerationResult> {
    const payload = await postOllamaJson<OllamaChatResponse>(
      `${this.#baseUrl}/api/chat`,
      this.#buildChatBody(input, false),
      this.#http,
    );

    const answer = payload.message?.content?.trim() || payload.response?.trim() || '';

    if (!answer) {
      throw new Error('Ollama returned an empty chat response');
    }

    return {
      answer,
      generationMetadata: this.#buildMetadata(input, false),
    };
  }

  /** NDJSON 增量输出；run() 仍走 generate()。 */
  async *generateStream(input: RuntimeGeneratorInput): AsyncIterable<RuntimeGenerationStreamEvent> {
    let answer = '';

    for await (const text of postOllamaNdjson(
      `${this.#baseUrl}/api/chat`,
      this.#buildChatBody(input, true),
      this.#http,
    )) {
      answer += text;
      yield {
        type: 'delta',
        text,
      };
    }

    if (!answer.trim()) {
      throw new Error('Ollama returned an empty chat response');
    }

    yield {
      type: 'complete',
      result: {
        answer,
        generationMetadata: this.#buildMetadata(input, true),
      },
    };
  }

  #buildPrompt(input: RuntimeGeneratorInput): string {
    // 有 postprocessor prompt 时不再本地拼装，避免和 runtime 后处理分叉
    if (input.promptContext) {
      return input.promptContext;
    }

    const contextText = input.chunks
      .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
      .join('\n\n');

    return [
      `问题：${input.request.effectiveQuery.query}`,
      '',
      '上下文：',
      contextText || '（无检索上下文）',
    ].join('\n');
  }

  #buildChatBody(input: RuntimeGeneratorInput, stream: boolean) {
    return {
      model: this.#model,
      stream,
      messages: [
        {
          role: 'system',
          content: this.#systemPrompt,
        },
        {
          role: 'user',
          content: this.#buildPrompt(input),
        },
      ],
    };
  }

  #buildMetadata(input: RuntimeGeneratorInput, streamed: boolean) {
    return {
      provider: 'ollama',
      model: this.#model,
      streamed,
      chunkIds: input.chunks.map((chunk) => chunk.id),
    };
  }
}
