import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type {
  RuntimeGenerationResult,
  RuntimeGenerationStreamEvent,
  RuntimeGenerator,
  RuntimeGeneratorInput,
} from '@monai-ragsdk/runtime';

import { OpenAIChatClient, type OpenAIChatClientOptions } from '../shared/openai-chat-client.js';

export type OpenAIRuntimeGeneratorFromClientOptions = {
  client: OpenAIChatClient;
  systemPrompt?: string;
};

export type OpenAIRuntimeGeneratorCreateOptions = OpenAIChatClientOptions & {
  systemPrompt?: string;
};

/** 注入共享 chat client，或按 model/baseUrl 自建；保留历史单类 new 用法。 */
export type OpenAIRuntimeGeneratorOptions =
  OpenAIRuntimeGeneratorFromClientOptions | OpenAIRuntimeGeneratorCreateOptions;

function isFromClientOptions(
  options: OpenAIRuntimeGeneratorOptions,
): options is OpenAIRuntimeGeneratorFromClientOptions {
  return 'client' in options && options.client instanceof OpenAIChatClient;
}

const DEFAULT_SYSTEM_PROMPT =
  '只根据提供的上下文回答问题。如果上下文不足以回答，就明确说明无法判断。';

/**
 * RAG 最终答问：拼 grounded prompt / metadata，实际 HTTP 交给共享 OpenAIChatClient。
 * run() 走 generate()；流式走 generateStream()，避免把流式超时语义套到非流式路径。
 */
export class OpenAIRuntimeGenerator implements RuntimeGenerator {
  readonly #client: OpenAIChatClient;
  readonly #systemPrompt: string;

  constructor(options: OpenAIRuntimeGeneratorOptions) {
    if (isFromClientOptions(options)) {
      this.#client = options.client;
      this.#systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
      return;
    }

    this.#client = new OpenAIChatClient(options);
    this.#systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  /** 供工厂/测试确认与 StrategyModel 共用同一 chat 客户端。 */
  get chatClient(): OpenAIChatClient {
    return this.#client;
  }

  async generate(input: RuntimeGeneratorInput): Promise<RuntimeGenerationResult> {
    const answer = await this.#client.createTextCompletion(this.#buildMessages(input));

    return {
      answer,
      generationMetadata: this.#buildMetadata(input, false),
    };
  }

  /** SSE 增量输出；空流在聚合后抛错，与非流式 empty response 语义对齐。 */
  async *generateStream(input: RuntimeGeneratorInput): AsyncIterable<RuntimeGenerationStreamEvent> {
    let answer = '';

    for await (const text of this.#client.streamText(this.#buildMessages(input))) {
      answer += text;
      yield {
        type: 'delta',
        text,
      };
    }

    if (!answer.trim()) {
      throw new Error('OpenAI-compatible chat returned an empty response');
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

  #buildMessages(input: RuntimeGeneratorInput): ChatCompletionMessageParam[] {
    return [
      {
        role: 'system',
        content: this.#systemPrompt,
      },
      {
        role: 'user',
        content: this.#buildPrompt(input),
      },
    ];
  }

  #buildMetadata(input: RuntimeGeneratorInput, streamed: boolean) {
    return {
      provider: 'openai',
      model: this.#client.model,
      streamed,
      chunkIds: input.chunks.map((chunk) => chunk.id),
    };
  }
}
