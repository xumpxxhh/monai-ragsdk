import { OpenAIEmbedder, OpenAIRuntimeGenerator } from "../src/index.js";

// mock HTTP，只验证 OpenAI 兼容 adapter 的请求映射，不依赖真实密钥。

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

const fetchImpl = async (url: string) => {
  if (url.includes("/embeddings")) {
    return jsonResponse({
      data: [
        { index: 0, embedding: [0.1, 0.2] },
        { index: 1, embedding: [0.3, 0.4] },
      ],
    });
  }

  return jsonResponse({
    choices: [
      {
        message: {
          content: "根据上下文，runtime 负责在线四阶段编排。",
        },
      },
    ],
  });
};

const embedder = new OpenAIEmbedder({
  model: "text-embedding-v3",
  baseUrl: "https://api.example.com/v1",
  dimension: 2,
  apiKey: "demo-key",
  fetch: fetchImpl,
});

const vectors = await embedder.embed([
  {
    id: "chunk-1",
    content: "runtime 负责在线四阶段编排。",
    metadata: { sourceId: "docs/runtime" },
  },
  {
    id: "chunk-2",
    content: "indexing 负责离线索引。",
    metadata: { sourceId: "docs/indexing" },
  },
]);

const generator = new OpenAIRuntimeGenerator({
  model: "demo-chat",
  baseUrl: "https://api.example.com/v1",
  apiKey: "demo-key",
  fetch: fetchImpl,
});

const generation = await generator.generate(
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
    requestId: "demo",
    input: { query: "runtime 是什么" },
    options: {},
    startedAt: Date.now(),
  },
);

console.log(
  JSON.stringify(
    {
      vectors,
      generation,
    },
    null,
    2,
  ),
);
