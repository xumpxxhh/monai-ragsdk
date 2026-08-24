import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import {
  createOpenAIClient,
  type FetchLike,
  type OpenAIClientOptions,
} from './create-openai-client.js';

export type OpenAIChatClientOptions = Omit<OpenAIClientOptions, 'apiKey'> & {
  model: string;
  apiKey?: string;
};

export type OpenAIChatCompleteInput = {
  prompt: string;
  system?: string;
};

/** ask / 策略优先用显式 apiKey，再回退 OPENAI_API_KEY；不和 embedding 密钥混用。 */
function resolveChatApiKey(apiKey?: string): string | undefined {
  return apiKey || process.env.OPENAI_API_KEY;
}

/**
 * 兼容 string content 与 array `{ text }` 分片（部分兼容网关会返回后者）。
 * Strategy / Generator 共用，避免两处各写一遍解析。
 */
export function readOpenAIMessageContent(
  content: string | Array<ChatCompletionContentPart | { text?: string }> | null | undefined,
): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (
        typeof part === 'object' &&
        part !== null &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text;
      }
      return '';
    })
    .join('')
    .trim();
}

/**
 * 共享 chat 调用面：策略 complete 与 generator 非流式/流式都走这里，
 * 使同一物理 LLM 只持有一个官方 SDK 客户端。
 */
export class OpenAIChatClient {
  readonly model: string;
  readonly #sdk: ReturnType<typeof createOpenAIClient>;

  constructor(options: OpenAIChatClientOptions) {
    const apiKey = resolveChatApiKey(options.apiKey);

    if (!apiKey) {
      throw new Error('OpenAIChatClient requires apiKey, or OPENAI_API_KEY');
    }

    const baseUrl = options.baseUrl.trim();

    if (!baseUrl) {
      throw new Error('OpenAIChatClient requires baseUrl');
    }

    if (!options.model.trim()) {
      throw new Error('OpenAIChatClient requires model');
    }

    this.model = options.model;
    this.#sdk = createOpenAIClient({
      apiKey,
      baseUrl,
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      maxRetries: options.maxRetries,
      retryDelayMs: options.retryDelayMs,
      fetch: options.fetch,
    });
  }

  /** 策略阶段：system + user prompt → 非空字符串。 */
  async complete(input: OpenAIChatCompleteInput): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [];

    if (input.system) {
      messages.push({ role: 'system', content: input.system });
    }

    messages.push({ role: 'user', content: input.prompt });

    const payload = await this.#sdk.chat.completions.create({
      model: this.model,
      stream: false,
      messages,
    });

    const answer = readOpenAIMessageContent(payload.choices?.[0]?.message?.content);

    if (!answer) {
      throw new Error('OpenAI-compatible strategy model returned an empty response');
    }

    return answer;
  }

  /** 非流式 chat；空答案抛错，供 RuntimeGenerator.generate 使用。 */
  async createTextCompletion(messages: ChatCompletionMessageParam[]): Promise<string> {
    const payload = await this.#sdk.chat.completions.create({
      model: this.model,
      stream: false,
      messages,
    });

    const answer = readOpenAIMessageContent(payload.choices?.[0]?.message?.content);

    if (!answer) {
      throw new Error('OpenAI-compatible chat returned an empty response');
    }

    return answer;
  }

  /**
   * 流式增量文本；一旦开始 yield 后不再重试（由 SDK 在首包前处理重试）。
   * 空流留给调用方（generator）在聚合后判断。
   */
  async *streamText(messages: ChatCompletionMessageParam[]): AsyncGenerator<string> {
    const stream = await this.#sdk.chat.completions.create({
      model: this.model,
      stream: true,
      messages,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;

      if (typeof content === 'string' && content.length > 0) {
        yield content;
      }
    }
  }
}
