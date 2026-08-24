import type {
  RuntimeContext,
  RuntimeStrategyModel,
  RuntimeStrategyModelInput,
} from '@monai-ragsdk/runtime';

import { OpenAIChatClient, type OpenAIChatClientOptions } from '../shared/openai-chat-client.js';

export type OpenAIStrategyModelFromClientOptions = {
  client: OpenAIChatClient;
  defaultSystem?: string;
};

export type OpenAIStrategyModelCreateOptions = OpenAIChatClientOptions & {
  defaultSystem?: string;
};

/** 注入共享 chat client，或按 model/baseUrl 自建；两路径对外类名不变。 */
export type OpenAIStrategyModelOptions =
  OpenAIStrategyModelFromClientOptions | OpenAIStrategyModelCreateOptions;

function isFromClientOptions(
  options: OpenAIStrategyModelOptions,
): options is OpenAIStrategyModelFromClientOptions {
  return 'client' in options && options.client instanceof OpenAIChatClient;
}

/** 供 runtime 策略件调用的 OpenAI 兼容 LLM；只做非流式 complete，委托共享 ChatClient。 */
export class OpenAIStrategyModel implements RuntimeStrategyModel {
  readonly #client: OpenAIChatClient;
  readonly #defaultSystem: string | undefined;

  constructor(options: OpenAIStrategyModelOptions) {
    if (isFromClientOptions(options)) {
      this.#client = options.client;
      this.#defaultSystem = options.defaultSystem;
      return;
    }

    this.#client = new OpenAIChatClient(options);
    this.#defaultSystem = options.defaultSystem;
  }

  /** 供工厂/测试确认与 Generator 共用同一 chat 客户端。 */
  get chatClient(): OpenAIChatClient {
    return this.#client;
  }

  async complete(input: RuntimeStrategyModelInput, _context: RuntimeContext): Promise<string> {
    return this.#client.complete({
      prompt: input.prompt,
      system: input.system ?? this.#defaultSystem,
    });
  }
}
