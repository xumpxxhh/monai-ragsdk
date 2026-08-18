import type { RuntimeGenerator } from "@monai-ragsdk/runtime";

import {
  postOllamaJson,
  type OllamaHttpOptions,
} from "../shared/http.js";

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

/** 按 Ollama /api/chat 生成答案；优先消费 runtime 的 promptContext，当前不做流式。 */
export class OllamaRuntimeGenerator implements RuntimeGenerator {
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #systemPrompt: string;
  readonly #http: OllamaHttpOptions;

  constructor(options: OllamaRuntimeGeneratorOptions) {
    this.#model = options.model;
    this.#baseUrl = (options.baseUrl ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.#systemPrompt =
      options.systemPrompt ??
      "只根据提供的上下文回答问题。如果上下文不足以回答，就明确说明无法判断。";
    this.#http = {
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      retryDelayMs: options.retryDelayMs,
      fetch: options.fetch,
    };
  }

  async generate(input: Parameters<RuntimeGenerator["generate"]>[0]) {
    const contextText = input.chunks
      .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
      .join("\n\n");
    // 有 postprocessor prompt 时不再本地拼装，避免和 runtime 后处理分叉
    const prompt = input.promptContext
      ? input.promptContext
      : [
          `问题：${input.request.effectiveQuery.query}`,
          "",
          "上下文：",
          contextText || "（无检索上下文）",
        ].join("\n");

    const payload = await postOllamaJson<OllamaChatResponse>(
      `${this.#baseUrl}/api/chat`,
      {
        model: this.#model,
        stream: false,
        messages: [
          {
            role: "system",
            content: this.#systemPrompt,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
      this.#http,
    );

    const answer =
      payload.message?.content?.trim() || payload.response?.trim() || "";

    if (!answer) {
      throw new Error("Ollama returned an empty chat response");
    }

    return {
      answer,
      generationMetadata: {
        provider: "ollama",
        model: this.#model,
        chunkIds: input.chunks.map((chunk) => chunk.id),
      },
    };
  }
}
