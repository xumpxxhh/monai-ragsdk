import type {
  RuntimeContext,
  RuntimeStrategyModel,
  RuntimeStrategyModelInput,
} from "@monai-ragsdk/runtime";

import {
  postOllamaJson,
  type OllamaHttpOptions,
} from "../shared/http.js";

export type OllamaStrategyModelOptions = OllamaHttpOptions & {
  model: string;
  baseUrl?: string;
  defaultSystem?: string;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  response?: string;
};

/** 供 runtime 策略件调用的 Ollama LLM；只做非流式 complete。 */
export class OllamaStrategyModel implements RuntimeStrategyModel {
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #defaultSystem: string | undefined;
  readonly #http: OllamaHttpOptions;

  constructor(options: OllamaStrategyModelOptions) {
    this.#model = options.model;
    this.#baseUrl = (options.baseUrl ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.#defaultSystem = options.defaultSystem;
    this.#http = {
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
      fetch: options.fetch,
    };
  }

  async complete(
    input: RuntimeStrategyModelInput,
    _context: RuntimeContext,
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    const system = input.system ?? this.#defaultSystem;

    if (system) {
      messages.push({ role: "system", content: system });
    }

    messages.push({ role: "user", content: input.prompt });

    const payload = await postOllamaJson<OllamaChatResponse>(
      `${this.#baseUrl}/api/chat`,
      {
        model: this.#model,
        stream: false,
        messages,
      },
      this.#http,
    );

    const answer = (payload.message?.content ?? payload.response ?? "").trim();

    if (!answer) {
      throw new Error("Ollama strategy model returned an empty response");
    }

    return answer;
  }
}
