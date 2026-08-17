import {
  createDefaultPostprocessor,
  createDefaultRuntime,
} from "../dist/index.js";

const runtime = createDefaultRuntime({
  postprocessor: createDefaultPostprocessor({
    scoreThreshold: 0.7,
    nearDuplicateRemovalConfig: {
      enabled: true,
    },
    budget: {
      maxCandidates: 3,
    },
    sourceCoverageConfig: {
      enabled: true,
      maxPerSource: 1,
    },
    candidatePredicate: ({ candidate }) => candidate.sourceId !== "docs/ignore",
    orderCandidates: (left, right) => (right.score ?? 0) - (left.score ?? 0),
    debug: true,
  }),
  retriever: {
    async retrieve(request) {
      return {
        candidates: [
          {
            chunk: {
              id: "chunk-1",
              content: `primary result for: ${request.effectiveQuery.query}`,
            },
            score: 0.99,
            sourceId: "docs/runtime",
          },
          {
            chunk: {
              id: "chunk-2",
              content: `primary result for: ${request.effectiveQuery.query}`,
            },
            fingerprint: "runtime-primary",
            score: 0.92,
            sourceId: "docs/runtime",
          },
          {
            chunk: {
              id: "chunk-3",
              content: `ignored result for: ${request.effectiveQuery.query}`,
            },
            score: 0.95,
            sourceId: "docs/ignore",
          },
          {
            chunk: {
              id: "chunk-4",
              content: `indexing result for: ${request.effectiveQuery.query}`,
            },
            score: 0.88,
            sourceId: "docs/indexing",
          },
        ],
        retrievalMetadata: {
          provider: "demo",
        },
      };
    },
  },
  generator: {
    async generate({ request, chunks, promptContext }) {
      return {
        answer: `${request.effectiveQuery.query} -> ${chunks.map((chunk) => chunk.id).join(",")}`,
        generationMetadata: {
          provider: "demo",
          promptContextLength: promptContext?.length ?? 0,
        },
      };
    },
  },
});

const result = await runtime.run(
  { query: "Explain runtime MVP" },
  { includeDebug: true },
);

console.log("runtime minimal demo passed");
console.log(result);
