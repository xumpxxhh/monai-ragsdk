import { describe, expect, it, vi } from "vitest";

import { OpenAIEmbedder, OpenAIRuntimeGenerator } from "../src/index.ts";

const TEST_OPENAI_BASE_URL = "https://api.example.com/v1";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("OpenAIEmbedder", () => {
  it("requires an api key from options or EMBEDDING_API_KEY", () => {
    const originalOpenAI = process.env.OPENAI_API_KEY;
    const originalEmbedding = process.env.EMBEDDING_API_KEY;
    delete process.env.EMBEDDING_API_KEY;
    process.env.OPENAI_API_KEY = "should-not-be-used";

    try {
      expect(
        () =>
          new OpenAIEmbedder({
            model: "text-embedding-v3",
            baseUrl: TEST_OPENAI_BASE_URL,
            dimension: 2,
          }),
      ).toThrow(/EMBEDDING_API_KEY/);
    } finally {
      if (originalOpenAI === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAI;
      }

      if (originalEmbedding === undefined) {
        delete process.env.EMBEDDING_API_KEY;
      } else {
        process.env.EMBEDDING_API_KEY = originalEmbedding;
      }
    }
  });

  it("requires a non-empty baseUrl", () => {
    expect(
      () =>
        new OpenAIEmbedder({
          model: "text-embedding-v3",
          baseUrl: "  ",
          dimension: 2,
          apiKey: "test-key",
        }),
    ).toThrow(/baseUrl/);
  });

  it("embeds chunks in batches, sends Bearer auth, and preserves metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { index: 1, embedding: [0.3, 0.4] },
          { index: 0, embedding: [0.1, 0.2] },
        ],
      }),
    );
    const embedder = new OpenAIEmbedder({
      model: "text-embedding-v3",
      baseUrl: TEST_OPENAI_BASE_URL,
      dimension: 2,
      batchSize: 2,
      apiKey: "test-key",
      fetch: fetchImpl,
    });

    const vectors = await embedder.embed([
      { id: "c1", content: "one", metadata: { sourceId: "a" } },
      { id: "c2", content: "two", metadata: { sourceId: "b" } },
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${TEST_OPENAI_BASE_URL}/embeddings`);
    expect(init?.headers?.authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "text-embedding-v3",
      input: ["one", "two"],
    });
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
          data: [{ index: 0, embedding: [1, 2] }],
        }),
      );
    const embedder = new OpenAIEmbedder({
      model: "text-embedding-v3",
      baseUrl: TEST_OPENAI_BASE_URL,
      dimension: 2,
      retries: 1,
      retryDelayMs: 1,
      apiKey: "test-key",
      fetch: fetchImpl,
    });

    const vectors = await embedder.embed([{ id: "c1", content: "one" }]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(vectors[0]?.values).toEqual([1, 2]);
  });

  it("rejects dimension mismatches", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ index: 0, embedding: [1, 2, 3] }],
      }),
    );
    const embedder = new OpenAIEmbedder({
      model: "text-embedding-v3",
      baseUrl: TEST_OPENAI_BASE_URL,
      dimension: 2,
      apiKey: "test-key",
      fetch: fetchImpl,
    });

    await expect(embedder.embed([{ id: "c1", content: "one" }])).rejects.toThrow(
      /dimension mismatch/,
    );
  });
});

describe("OpenAIRuntimeGenerator", () => {
  it("requires an api key from options or OPENAI_API_KEY", () => {
    const originalOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      expect(
        () =>
          new OpenAIRuntimeGenerator({
            model: "demo-chat",
            baseUrl: TEST_OPENAI_BASE_URL,
          }),
      ).toThrow(/OPENAI_API_KEY/);
    } finally {
      if (originalOpenAI === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAI;
      }
    }
  });

  it("requires a non-empty baseUrl", () => {
    expect(
      () =>
        new OpenAIRuntimeGenerator({
          model: "demo-chat",
          baseUrl: "  ",
          apiKey: "test-key",
        }),
    ).toThrow(/baseUrl/);
  });

  it("builds a grounded prompt and returns the model answer", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: "根据上下文，runtime 负责在线编排。",
            },
          },
        ],
      }),
    );
    const generator = new OpenAIRuntimeGenerator({
      model: "demo-chat",
      baseUrl: TEST_OPENAI_BASE_URL,
      apiKey: "test-key",
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
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${TEST_OPENAI_BASE_URL}/chat/completions`);
    expect(init?.headers?.authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      stream: boolean;
      messages: Array<{ content: string }>;
    };
    expect(body.model).toBe("demo-chat");
    expect(body.stream).toBe(false);
    expect(body.messages[1]?.content).toContain("runtime 负责在线四阶段编排。");
  });

  it("prefers runtime promptContext over locally assembled prompt", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: "使用后处理 prompt。" } }],
      }),
    );
    const generator = new OpenAIRuntimeGenerator({
      model: "demo-chat",
      baseUrl: TEST_OPENAI_BASE_URL,
      apiKey: "test-key",
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
    expect(body.messages[1]?.content).not.toContain("不应出现在请求里");
  });

  it("rejects empty chat responses", async () => {
    const generator = new OpenAIRuntimeGenerator({
      model: "demo-chat",
      baseUrl: TEST_OPENAI_BASE_URL,
      apiKey: "test-key",
      fetch: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "   " } }],
        }),
      ),
    });

    await expect(
      generator.generate(
        {
          request: {
            originalQuery: { query: "runtime 是什么" },
            effectiveQuery: { query: "runtime 是什么" },
          },
          chunks: [],
        },
        {
          requestId: "req-3",
          input: { query: "runtime 是什么" },
          options: {},
          startedAt: Date.now(),
        },
      ),
    ).rejects.toThrow(/empty response/);
  });

  it("streams SSE deltas across split chunks and returns the complete answer", async () => {
    const fetchImpl = vi.fn(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"根据"}}]}\n\n'),
          );
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"上下文"}}]}\n\ndata: [DONE]\n\n',
            ),
          );
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    const generator = new OpenAIRuntimeGenerator({
      model: "demo-chat",
      baseUrl: TEST_OPENAI_BASE_URL,
      apiKey: "test-key",
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
            provider: "openai",
            model: "demo-chat",
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

  it("rejects an empty chat stream", async () => {
    const generator = new OpenAIRuntimeGenerator({
      model: "demo-chat",
      baseUrl: TEST_OPENAI_BASE_URL,
      apiKey: "test-key",
      fetch: vi.fn(
        async () =>
          new Response("data: [DONE]\n\n", {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    });

    await expect(async () => {
      for await (const _event of generator.generateStream(
        {
          request: {
            originalQuery: { query: "runtime 是什么" },
            effectiveQuery: { query: "runtime 是什么" },
          },
          chunks: [],
        },
        {
          requestId: "req-empty-stream",
          input: { query: "runtime 是什么" },
          options: {},
          startedAt: Date.now(),
        },
      )) {
        // drain
      }
    }).rejects.toThrow(/empty response/);
  });
});
