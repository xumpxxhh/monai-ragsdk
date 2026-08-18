import {
  FanOutRetriever,
  StrategyQueryPreprocessor,
  StrategyRetrievalPostprocessor,
  createDefaultRuntime,
  createLostInTheMiddleStrategy,
  createMultiQueryStrategy,
  createQueryRewriteStrategy,
  type RuntimeStrategyModel,
} from "../dist/index.js";

/** demo 不打真实 LLM：按 prompt 类型返回固定 JSON，只演示策略链接线。 */
const demoModel: RuntimeStrategyModel = {
  async complete(input) {
    if (input.prompt.includes("改写成一条")) {
      return JSON.stringify({ query: "pgvector PostgreSQL 向量扩展" });
    }

    return JSON.stringify({
      queries: ["什么是 pgvector", "pgvector 和 PostgreSQL 的关系"],
    });
  },
};

const runtime = createDefaultRuntime({
  preprocessor: new StrategyQueryPreprocessor({
    strategies: [
      createQueryRewriteStrategy({ model: demoModel }),
      createMultiQueryStrategy({ model: demoModel, count: 2 }),
    ],
  }),
  retriever: new FanOutRetriever({
    retriever: {
      async retrieve(request) {
        return {
          candidates: [
            {
              chunk: {
                id: `chunk-${request.effectiveQuery.query}`,
                content: request.effectiveQuery.query,
              },
              score: request.effectiveQuery.query.includes("关系") ? 0.4 : 0.9,
            },
          ],
        };
      },
    },
  }),
  postprocessor: new StrategyRetrievalPostprocessor({
    strategies: [createLostInTheMiddleStrategy()],
  }),
  generator: {
    async generate({ request, chunks }) {
      return {
        answer: chunks.map((chunk) => chunk.id).join(","),
        generationMetadata: {
          effectiveQuery: request.effectiveQuery.query,
          subQueries: request.subQueries?.map((item) => item.query),
        },
      };
    },
  },
});

const result = await runtime.run({ query: "pgvector 是什么？" });

console.log("strategy pipeline demo passed");
console.log(result);
