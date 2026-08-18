import { describe, expect, expectTypeOf, it } from "vitest";

import * as srcExports from "../src/index.ts";
import * as distExports from "../dist/index.js";
import type {
  RetrievalCandidate,
  RetrievalRequest,
  Runtime,
  RuntimeCitation,
  RuntimeQueryInput,
  RuntimeResult,
  RuntimeRunOptions,
  RuntimeStage,
} from "../src/index.ts";

describe("runtime export surface", () => {
  it("keeps dist runtime exports aligned with src runtime exports", () => {
    expect(Object.keys(distExports).sort()).toEqual(
      Object.keys(srcExports).sort(),
    );
  });

  it("exposes runtime constructors from dist", () => {
    expect(distExports.RuntimeError).toBeDefined();
    expect(distExports.NoopQueryPreprocessor).toBeDefined();
    expect(distExports.PassthroughRetrievalPostprocessor).toBeDefined();
    expect(distExports.createDefaultPostprocessor).toBeDefined();
    expect(distExports.applyCandidatePredicateStrategy).toBeDefined();
    expect(distExports.applyCandidateOrderingStrategy).toBeDefined();
    expect(distExports.applyNearDuplicateRemovalStrategy).toBeDefined();
    expect(distExports.applySourceCoverageStrategy).toBeDefined();
    expect(distExports.applyScoreThresholdStrategy).toBeDefined();
    expect(distExports.applyBudgetTrimStrategy).toBeDefined();
    expect(distExports.fuseByReciprocalRankFusion).toBeDefined();
    expect(distExports.FanOutRetriever).toBeDefined();
    expect(distExports.StrategyQueryPreprocessor).toBeDefined();
    expect(distExports.StrategyRetrievalPostprocessor).toBeDefined();
    expect(distExports.createLostInTheMiddleStrategy).toBeDefined();
    expect(distExports.applyLostInTheMiddleStrategy).toBeDefined();
    expect(distExports.createQueryRewriteStrategy).toBeDefined();
    expect(distExports.createQueryExpansionStrategy).toBeDefined();
    expect(distExports.createQueryDecompositionStrategy).toBeDefined();
    expect(distExports.createMultiQueryStrategy).toBeDefined();
    expect(distExports.createQueryRoutingStrategy).toBeDefined();
    expect(distExports.createLlmRerankStrategy).toBeDefined();
    expect(distExports.createContextCompressionStrategy).toBeDefined();
    expect(distExports.parseRewrittenQuery).toBeDefined();
    expect(distExports.parseQueryList).toBeDefined();
    expect(distExports.RuntimeStrategyModel).toBeUndefined();
    expect(typeof distExports.OpenAIStrategyModel).toBe("undefined");
    expect(distExports.createIndexingRetrievalFilters).toBeDefined();
    expect(distExports.createIndexingRetrievalCandidate).toBeDefined();
    expect(distExports.createRuntime).toBeDefined();
    expect(distExports.createDefaultRuntime).toBeDefined();
    expect(distExports.buildRuntimeCitations).toBeDefined();
  });

  it("preserves the intended public types", () => {
    expectTypeOf<RuntimeStage>().toEqualTypeOf<
      "pre-retrieval" | "retrieval" | "post-retrieval" | "generation"
    >();
    expectTypeOf<RuntimeQueryInput>().toMatchObjectType<{
      query: string;
    }>();
    expectTypeOf<RetrievalRequest>().toHaveProperty("originalQuery");
    expectTypeOf<RetrievalCandidate>().toHaveProperty("chunk");
    expectTypeOf<RuntimeRunOptions>().toMatchObjectType<{
      includeDebug?: boolean;
      requestId?: string;
    }>();
    expectTypeOf<RuntimeResult>().toHaveProperty("answer");
    expectTypeOf<RuntimeResult>().toHaveProperty("citations");
    expectTypeOf<RuntimeCitation>().toMatchObjectType<{
      index: number;
      chunkId: string;
      sourceId?: string;
      score?: number;
      title?: string;
      hierarchyPath?: string;
    }>();
    expectTypeOf<Runtime>().toHaveProperty("run");
    expectTypeOf<Runtime>().toHaveProperty("runStream");
  });
});
