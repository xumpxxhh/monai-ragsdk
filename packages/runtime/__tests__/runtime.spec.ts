import { describe, expect, it } from "vitest";

import {
  RuntimeError,
  createDefaultRuntime,
  createRuntime,
} from "../src/index.ts";

describe("runtime pipeline", () => {
  it("runs the minimal four-stage flow", async () => {
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve(request) {
          return {
            candidates: [
              {
                chunk: {
                  id: "chunk-1",
                  content: `retrieved for: ${request.effectiveQuery.query}`,
                },
                score: 0.95,
              },
            ],
            retrievalMetadata: {
              provider: "unit-test",
            },
          };
        },
      },
      generator: {
        async generate({ request, chunks }) {
          return {
            answer: `${request.effectiveQuery.query} -> ${chunks[0]?.content ?? "no chunk"}`,
            generationMetadata: {
              provider: "unit-test",
            },
          };
        },
      },
    });

    await expect(
      runtime.run({ query: "Explain runtime contract" }),
    ).resolves.toMatchObject({
      answer:
        "Explain runtime contract -> retrieved for: Explain runtime contract",
      chunks: [
        {
          id: "chunk-1",
          content: "retrieved for: Explain runtime contract",
        },
      ],
      originalQuery: { query: "Explain runtime contract" },
      effectiveQuery: { query: "Explain runtime contract" },
      retrievalMetadata: {
        provider: "unit-test",
      },
      generationMetadata: {
        provider: "unit-test",
      },
    });
  });

  it("returns debug info when includeDebug is enabled", async () => {
    const runtime = createRuntime({
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: `${input.query} site:runtime` },
            route: "runtime-docs",
            rewriteReason: "prefer runtime docs",
            strategy: "metadata-first",
            indexingMode: "incremental",
            filters: {
              sourceIds: ["docs/runtime"],
              hierarchyPaths: ["runtime/api"],
            },
            budget: {
              maxCandidates: 4,
              maxChunks: 1,
            },
            rerank: {
              strategy: "score-threshold",
              minScore: 0.7,
            },
          };
        },
      },
      retriever: {
        async retrieve(request) {
          return {
            candidates: [
              {
                chunk: {
                  id: "chunk-1",
                  content: `retrieved for: ${request.effectiveQuery.query}`,
                },
                score: 0.91,
                sourceId: "docs/runtime",
                hierarchyPath: "runtime/api",
              },
              {
                chunk: {
                  id: "chunk-2",
                  content: `secondary for: ${request.effectiveQuery.query}`,
                },
                score: 0.5,
                sourceId: "docs/runtime",
                hierarchyPath: "runtime/faq",
              },
            ],
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return {
            chunks: [candidates[0]!.chunk],
            selectedCandidates: [candidates[0]!],
            droppedCandidates: [candidates[1]!],
            appliedBudget: {
              maxCandidates: 4,
              maxChunks: 1,
            },
            appliedScoreThreshold: 0.7,
            promptContext: `query: Explain debug mode\n\n${candidates[0]!.chunk.content}`,
          };
        },
      },
      generator: {
        async generate({ request }) {
          return {
            answer: `answer for ${request.effectiveQuery.query}`,
          };
        },
      },
    });

    const result = await runtime.run(
      { query: "Explain debug mode" },
      { includeDebug: true },
    );

    expect(result.debug).toMatchObject({
      route: "runtime-docs",
      rewriteReason: "prefer runtime docs",
      retrievalStrategy: "metadata-first",
      rerankStrategy: "score-threshold",
      indexingMode: "incremental",
      filters: {
        sourceIds: ["docs/runtime"],
        hierarchyPaths: ["runtime/api"],
      },
      retrievedCount: 2,
      selectedCount: 1,
      droppedCount: 1,
      finalChunkCount: 1,
      appliedBudget: {
        maxCandidates: 4,
        maxChunks: 1,
      },
      appliedScoreThreshold: 0.7,
      promptContext:
        "query: Explain debug mode\n\nretrieved for: Explain debug mode site:runtime",
    });
    expect(result.debug?.timings.total).toBeTypeOf("number");
  });

  it("wraps stage failures as RuntimeError", async () => {
    const runtime = createRuntime({
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
          };
        },
      },
      retriever: {
        async retrieve() {
          throw new Error("retriever failed");
        },
      },
      postprocessor: {
        async postprocess() {
          return { chunks: [] };
        },
      },
      generator: {
        async generate() {
          return { answer: "never" };
        },
      },
    });

    await expect(runtime.run({ query: "fail here" })).rejects.toBeInstanceOf(
      RuntimeError,
    );
    await expect(runtime.run({ query: "fail here" })).rejects.toMatchObject({
      stage: "retrieval",
      originalQuery: { query: "fail here" },
      effectiveQuery: { query: "fail here" },
      cause: expect.any(Error),
    });
  });
});
