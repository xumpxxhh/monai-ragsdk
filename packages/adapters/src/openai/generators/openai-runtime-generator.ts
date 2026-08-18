import type {
  RuntimeGenerationResult,
  RuntimeGenerationStreamEvent,
  RuntimeGenerator,
  RuntimeGeneratorInput,
} from '@monai-ragsdk/runtime';

import { postOpenAIJson, postOpenAISse, type OpenAIHttpOptions } from '../shared/http.js';

export type OpenAIRuntimeGeneratorOptions = Omit<OpenAIHttpOptions, 'apiKey'> & {
  model: string;
  /** OpenAI 兼容 /chat/completions 的根地址，须由调用方显式传入，SDK 不内置厂商 URL。 */
  baseUrl: string;
  apiKey?: string;
  systemPrompt?: string;
};

type OpenAIChatMessage = {
  content?: string | Array<{ text?: string }>;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: OpenAIChatMessage;
  }>;
};

/** ask 优先用显式 apiKey，再回退 OPENAI_API_KEY；不和 embedding 密钥混用。 */
function resolveApiKey(apiKey?: string): string | undefined {
  return apiKey || process.env.OPENAI_API_KEY;
}

function readMessageContent(content: OpenAIChatMessage['content']): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

/** 按 OpenAI 兼容 /chat/completions 生成答案；baseUrl / model 由调用方传入。 */
export class OpenAIRuntimeGenerator implements RuntimeGenerator {
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #systemPrompt: string;
  readonly #http: OpenAIHttpOptions;

  constructor(options: OpenAIRuntimeGeneratorOptions) {
    const apiKey = resolveApiKey(options.apiKey);

    if (!apiKey) {
      throw new Error('OpenAIRuntimeGenerator requires apiKey, or OPENAI_API_KEY');
    }

    const baseUrl = options.baseUrl.trim();

    if (!baseUrl) {
      throw new Error('OpenAIRuntimeGenerator requires baseUrl');
    }

    if (!options.model.trim()) {
      throw new Error('OpenAIRuntimeGenerator requires model');
    }

    this.#model = options.model;
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#systemPrompt =
      options.systemPrompt ??
      '只根据提供的上下文回答问题。如果上下文不足以回答，就明确说明无法判断。';
    this.#http = {
      apiKey,
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
      fetch: options.fetch,
    };
  }

  async generate(input: RuntimeGeneratorInput): Promise<RuntimeGenerationResult> {
    const payload = await postOpenAIJson<OpenAIChatResponse>(
      `${this.#baseUrl}/chat/completions`,
      this.#buildChatBody(input, false),
      this.#http,
    );

    const answer = readMessageContent(payload.choices?.[0]?.message?.content);

    if (!answer) {
      throw new Error('OpenAI-compatible chat returned an empty response');
    }

    return {
      answer,
      generationMetadata: this.#buildMetadata(input, false),
    };
  }

  /** SSE 增量输出；run() 仍走 generate()，避免把流式超时套到非流式 JSON 调用。 */
  async *generateStream(input: RuntimeGeneratorInput): AsyncIterable<RuntimeGenerationStreamEvent> {
    let answer = '';

    for await (const text of postOpenAISse(
      `${this.#baseUrl}/chat/completions`,
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
      provider: 'openai',
      model: this.#model,
      streamed,
      chunkIds: input.chunks.map((chunk) => chunk.id),
    };
  }
}
