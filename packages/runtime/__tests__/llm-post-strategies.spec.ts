import { describe, expect, it } from "vitest";

import type { RuntimeContext, RuntimeStrategyModel } from "../src/index.ts";

import {
  createContextCompressionStrategy,
  createLlmRerankStrategy,
  StrategyRetrievalPostprocessor,
} from "../src/index.ts";

const context: RuntimeContext = {
  requestId: "req-1",
  input: { query: "pgvector 是什么？" },
  options: {},
  startedAt: Date.now(),
};

function jsonModel(payload: unknown): RuntimeStrategyModel {
  return {
    async complete() {
      return JSON.stringify(payload);
    },
  };
}

describe("post-retrieval LLM strategies", () => {
  it("llm reranks candidates and writes back candidate.score", async () => {
    const strategy = createLlmRerankStrategy({
      model: jsonModel({
        ranked: [
          { chunkId: "c2", score: 0.99 },
          { chunkId: "c1", score: 0.1 },
          { chunkId: "c3", score: 0.5 },
        ],
      }),
    });

    const result = await strategy.apply(
      {
        request: {
          originalQuery: { query: "pgvector" },
          effectiveQuery: { query: "pgvector" },
          rerank: { strategy: "llm-rerank" },
        },
        candidates: [
          {
            chunk: { id: "c1", content: "c1" },
            score: 0.2,
          },
          {
            chunk: { id: "c2", content: "c2" },
            score: 0.9,
          },
          {
            chunk: { id: "c3", content: "c3" },
            score: 0.3,
          },
        ],
      },
      context,
    );

    expect(result.selectedCandidates.map((c) => c.chunk.id)).toEqual([
      "c2",
      "c1",
      "c3",
    ]);
    const c2 = result.selectedCandidates.find((c) => c.chunk.id === "c2")!;
    expect(c2.score).toBe(0.99);
  });

  it("compresses each candidate chunk.content", async () => {
    const strategy = createContextCompressionStrategy({
      model: jsonModel({ compressed: "compressed" }),
      maxCharsPerChunk: 50,
      maxConcurrency: 2,
    });

    const result = await strategy.apply(
      {
        request: {
          originalQuery: { query: "pgvector" },
          effectiveQuery: { query: "pgvector" },
        },
        candidates: [
          { chunk: { id: "c1", content: "long long long" }, score: 0.1 },
          { chunk: { id: "c2", content: "more more more" }, score: 0.2 },
        ],
      },
      context,
    );

    expect(result.selectedCandidates.map((c) => c.chunk.content)).toEqual([
      "compressed",
      "compressed",
    ]);
  });

  it("works in StrategyRetrievalPostprocessor chain (rerank + compression)", async () => {
    const postprocessor = new StrategyRetrievalPostprocessor({
      strategies: [
        createLlmRerankStrategy({
          model: jsonModel({
            ranked: [
              { chunkId: "c2", score: 0.9 },
              { chunkId: "c1", score: 0.1 },
            ],
          }),
        }),
        createContextCompressionStrategy({
          model: jsonModel({ compressed: "sum" }),
          maxConcurrency: 2,
        }),
      ],
    });

    const result = await postprocessor.postprocess(
      {
        request: {
          originalQuery: { query: "pgvector" },
          effectiveQuery: { query: "pgvector" },
        },
        candidates: [
          { chunk: { id: "c1", content: "c1" }, score: 0.2 },
          { chunk: { id: "c2", content: "c2" }, score: 0.3 },
        ],
      },
      context,
    );

    expect(result.chunks.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(result.chunks.map((c) => c.content)).toEqual(["sum", "sum"]);
  });
});

