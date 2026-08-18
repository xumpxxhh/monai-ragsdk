import type {
  RuntimeContext,
  RuntimeStrategyModel,
  RuntimeStrategyModelInput,
} from '@monai-ragsdk/runtime';

import { postOpenAIJson, type OpenAIHttpOptions } from '../shared/http.js';

export type OpenAIStrategyModelOptions = Omit<OpenAIHttpOptions, 'apiKey'> & {
  model: string;
  /** OpenAI 兼容 /chat/completions 根地址，须由调用方显式传入。 */
  baseUrl: string;
  apiKey?: string;
  defaultSystem?: string;
};

type OpenAIChatMessage = {
  content?: string | Array<{ text?: string }>;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: OpenAIChatMessage;
  }>;
};

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

/** 供 runtime 策略件调用的 OpenAI 兼容 LLM；只做非流式 complete。 */
export class OpenAIStrategyModel implements RuntimeStrategyModel {
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #defaultSystem: string | undefined;
  readonly #http: OpenAIHttpOptions;

  constructor(options: OpenAIStrategyModelOptions) {
    const apiKey = resolveApiKey(options.apiKey);

    if (!apiKey) {
      throw new Error('OpenAIStrategyModel requires apiKey, or OPENAI_API_KEY');
    }

    const baseUrl = options.baseUrl.trim();

    if (!baseUrl) {
      throw new Error('OpenAIStrategyModel requires baseUrl');
    }

    if (!options.model.trim()) {
      throw new Error('OpenAIStrategyModel requires model');
    }

    this.#model = options.model;
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#defaultSystem = options.defaultSystem;
    this.#http = {
      apiKey,
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
      fetch: options.fetch,
    };
  }

  async complete(input: RuntimeStrategyModelInput, _context: RuntimeContext): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    const system = input.system ?? this.#defaultSystem;

    if (system) {
      messages.push({ role: 'system', content: system });
    }

    messages.push({ role: 'user', content: input.prompt });

    const payload = await postOpenAIJson<OpenAIChatResponse>(
      `${this.#baseUrl}/chat/completions`,
      {
        model: this.#model,
        stream: false,
        messages,
      },
      this.#http,
    );

    const answer = readMessageContent(payload.choices?.[0]?.message?.content);

    if (!answer) {
      throw new Error('OpenAI-compatible strategy model returned an empty response');
    }

    return answer;
  }
}
