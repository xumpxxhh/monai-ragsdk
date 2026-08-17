import { describe, expect, it, vi } from "vitest";

import { LangChainRuntimeGeneratorAdapter } from "../src/index.ts";

describe("LangChainRuntimeGeneratorAdapter", () => {
  it("uses runtime promptContext by default and extracts answer plus metadata", async () => {
    const invoke = vi.fn(async () => ({
      content: [{ text: "runtime answer" }],
      response_metadata: {
        model: "fake-chat-model",
      },
      usage_metadata: {
        input_tokens: 12,
        output_tokens: 4,
      },
    }));
    const adapter = new LangChainRuntimeGeneratorAdapter({
      generator: { invoke },
    });

    const result = await adapter.generate(
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

    expect(invoke).toHaveBeenCalledWith(
      "query: Explain runtime\n\nruntime context",
    );
    expect(result).toEqual({
      answer: "runtime answer",
      generationMetadata: {
        model: "fake-chat-model",
        input_tokens: 12,
        output_tokens: 4,
      },
    });
  });

  it("supports custom prompt building and string output parsing", async () => {
    const adapter = new LangChainRuntimeGeneratorAdapter({
      generator: {
        async invoke(prompt: { query: string; context: string }) {
          expect(prompt).toEqual({
            query: "Explain runtime site:docs",
            context: "runtime context",
          });

          return "custom answer";
        },
      },
      buildPrompt(input) {
        return {
          query: input.request.effectiveQuery.query,
          context: input.chunks.map((chunk) => chunk.content).join("\n\n"),
        };
      },
    });

    const result = await adapter.generate(
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
      },
      {
        requestId: "test",
        input: { query: "Explain runtime" },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(result).toEqual({
      answer: "custom answer",
      generationMetadata: undefined,
    });
  });
});
