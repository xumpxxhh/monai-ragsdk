import { describe, expect, it, vi } from "vitest";

import { OllamaEmbedder, OllamaRuntimeGenerator } from "../src/index.ts";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("OllamaEmbedder", () => {
  it("embeds chunks in batches and preserves metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      }),
    );
    const embedder = new OllamaEmbedder({
      model: "nomic-embed-text",
      dimension: 2,
      batchSize: 2,
      fetch: fetchImpl,
    });

    const vectors = await embedder.embed([
      { id: "c1", content: "one", metadata: { sourceId: "a" } },
      { id: "c2", content: "two", metadata: { sourceId: "b" } },
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vectors).toEqual([
      { id: "c1", values: [0.1, 0.2], metadata: { sourceId: "a" } },
      { id: "c2", values: [0.3, 0.4], metadata: { sourceId: "b" } },
    ]);
  });

  it("retries retryable HTTP failures then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          embeddings: [[1, 2]],
        }),
      );
    const embedder = new OllamaEmbedder({
      model: "nomic-embed-text",
      dimension: 2,
      retries: 1,
      retryDelayMs: 1,
      fetch: fetchImpl,
    });

    const vectors = await embedder.embed([{ id: "c1", content: "one" }]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(vectors[0]?.values).toEqual([1, 2]);
  });
});

describe("OllamaRuntimeGenerator", () => {
  it("builds a grounded prompt and returns the model answer", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        message: {
          content: "根据上下文，runtime 负责在线编排。",
        },
      }),
    );
    const generator = new OllamaRuntimeGenerator({
      model: "qwen2.5",
      fetch: fetchImpl,
    });

    const result = await generator.generate(
      {
        request: {
          originalQuery: { query: "runtime 是什么" },
          effectiveQuery: { query: "runtime 是什么" },
        },
        chunks: [
          {
            id: "chunk-1",
            content: "runtime 负责在线四阶段编排。",
          },
        ],
      },
      {
        requestId: "req-1",
        input: { query: "runtime 是什么" },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(result.answer).toContain("在线编排");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[1]?.content).toContain("runtime 负责在线四阶段编排。");
  });

  it("prefers runtime promptContext over locally assembled prompt", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        message: {
          content: "使用后处理 prompt。",
        },
      }),
    );
    const generator = new OllamaRuntimeGenerator({
      model: "qwen2.5",
      fetch: fetchImpl,
    });

    await generator.generate(
      {
        request: {
          originalQuery: { query: "runtime 是什么" },
          effectiveQuery: { query: "runtime 是什么" },
        },
        promptContext: "后处理给出的 grounded prompt",
        chunks: [{ id: "chunk-1", content: "不应出现在请求里" }],
      },
      {
        requestId: "req-2",
        input: { query: "runtime 是什么" },
        options: {},
        startedAt: Date.now(),
      },
    );

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[1]?.content).toBe("后处理给出的 grounded prompt");
  });

  it("streams NDJSON deltas and returns the complete answer", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          [
            JSON.stringify({
              message: { content: "根据" },
              done: false,
            }),
            JSON.stringify({
              message: { content: "上下文" },
              done: true,
            }),
          ].join("\n") + "\n",
          {
            status: 200,
            headers: { "content-type": "application/x-ndjson" },
          },
        ),
    );
    const generator = new OllamaRuntimeGenerator({
      model: "qwen2.5",
      fetch: fetchImpl,
    });
    const events = [];

    for await (const event of generator.generateStream(
      {
        request: {
          originalQuery: { query: "runtime 是什么" },
          effectiveQuery: { query: "runtime 是什么" },
        },
        chunks: [{ id: "chunk-1", content: "runtime 负责在线四阶段编排。" }],
      },
      {
        requestId: "req-stream",
        input: { query: "runtime 是什么" },
        options: {},
        startedAt: Date.now(),
      },
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "根据" },
      { type: "delta", text: "上下文" },
      {
        type: "complete",
        result: {
          answer: "根据上下文",
          generationMetadata: {
            provider: "ollama",
            model: "qwen2.5",
            streamed: true,
            chunkIds: ["chunk-1"],
          },
        },
      },
    ]);

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      stream: boolean;
    };
    expect(body.stream).toBe(true);
  });
});
