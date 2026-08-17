import {
  SimpleChatModel,
  type BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { describe, expect, it } from "vitest";

import { createLangChainChatModelRuntimeGenerator } from "../src/index.ts";

class FakeChatModel extends SimpleChatModel<BaseChatModelCallOptions> {
  lastMessages?: BaseMessage[];
  lastOptions?: this["ParsedCallOptions"];

  _llmType() {
    return "fake-chat-model";
  }

  async _call(messages: BaseMessage[], options: this["ParsedCallOptions"]) {
    this.lastMessages = messages;
    this.lastOptions = options;

    return "runtime answer";
  }
}

describe("createLangChainChatModelRuntimeGenerator", () => {
  it("wraps a BaseChatModel and builds default system plus human messages", async () => {
    const model = new FakeChatModel({});
    const generator = createLangChainChatModelRuntimeGenerator({
      model,
      systemPrompt: "You answer using runtime context only.",
      mapCallOptions() {
        return {
          stop: ["END"],
        };
      },
    });

    const result = await generator.generate(
      {
        request: {
          originalQuery: { query: "Explain runtime" },
          effectiveQuery: { query: "Explain runtime site:docs" },
        },
        chunks: [
          {
            id: "chunk-1",
            content: "runtime context",
          },
        ],
        promptContext: "query: Explain runtime\n\nruntime context",
      },
      {
        requestId: "test",
        input: { query: "Explain runtime" },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(model.lastMessages?.[0]).toBeInstanceOf(SystemMessage);
    expect(model.lastMessages?.[1]).toBeInstanceOf(HumanMessage);
    expect(model.lastMessages?.[1]?.content).toBe(
      "query: Explain runtime\n\nruntime context",
    );
    expect(model.lastOptions?.stop).toEqual(["END"]);
    expect(result.answer).toBe("runtime answer");
  });

  it("supports custom message building when provider prompt format needs overriding", async () => {
    const model = new FakeChatModel({});
    const generator = createLangChainChatModelRuntimeGenerator({
      model,
      buildMessages(input) {
        return [
          new SystemMessage("custom system"),
          new HumanMessage(`custom:${input.request.effectiveQuery.query}`),
        ];
      },
    });

    await generator.generate(
      {
        request: {
          originalQuery: { query: "Explain runtime" },
          effectiveQuery: { query: "Explain runtime site:docs" },
        },
        chunks: [],
      },
      {
        requestId: "test",
        input: { query: "Explain runtime" },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(model.lastMessages?.map((message) => message.content)).toEqual([
      "custom system",
      "custom:Explain runtime site:docs",
    ]);
  });
});
