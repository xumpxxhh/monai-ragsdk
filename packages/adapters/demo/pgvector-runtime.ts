import { PgVectorRuntimeRetrieverAdapter } from "../src/index.js";

// mock pg client，只演示向量/关键词融合与 runtime filter，不连接真实 PostgreSQL。

const query = async (sql: string) => {
  if (sql.includes("<=>")) {
    return {
      rows: [
        {
          id: "chunk-runtime",
          content: "runtime 负责在线四阶段编排。",
          metadata: { sourceId: "docs/runtime" },
          score: 0.91,
        },
        {
          id: "chunk-faq",
          content: "faq about runtime",
          metadata: { sourceId: "docs/faq" },
          score: 0.42,
        },
      ],
    };
  }

  return {
    rows: [
      {
        id: "chunk-runtime",
        content: "runtime 负责在线四阶段编排。",
        metadata: { sourceId: "docs/runtime" },
        score: 0.8,
      },
    ],
  };
};

const retriever = new PgVectorRuntimeRetrieverAdapter({
  tableName: "rag_vectors",
  client: { query },
  embedQuery: async () => [0.1, 0.2],
});

const result = await retriever.retrieve(
  {
    originalQuery: { query: "runtime 是什么" },
    effectiveQuery: { query: "runtime 是什么" },
    route: "docs",
    strategy: "vector-search",
    filters: {
      sourceIds: ["docs/runtime"],
    },
    budget: {
      maxChunks: 3,
    },
  },
  {
    requestId: "demo",
    input: { query: "runtime 是什么" },
    options: {},
    startedAt: Date.now(),
  },
);

console.log(JSON.stringify(result, null, 2));
