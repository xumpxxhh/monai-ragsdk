import { describe, expect, expectTypeOf, it } from 'vitest';

import * as srcExports from '../src/index.ts';
import * as distExports from '../dist/index.js';
import * as srcContract from '../src/contract/index.ts';
import * as distContract from '../dist/contract/index.js';
import type {
  RetrievalCandidate,
  RetrievalRequest,
  Runtime,
  RuntimeCitation,
  RuntimeQueryInput,
  RuntimeResult,
  RuntimeRunOptions,
  RuntimeSearchResult,
  RuntimeStage,
} from '../src/index.ts';

describe('runtime export surface', () => {
  it('keeps dist runtime exports aligned with src runtime exports', () => {
    expect(Object.keys(distExports).sort()).toEqual(Object.keys(srcExports).sort());
  });

  it('keeps dist contract exports aligned with src contract exports', () => {
    expect(Object.keys(distContract).sort()).toEqual(Object.keys(srcContract).sort());
  });

  it('exposes orchestration APIs from the package root', () => {
    expect(distExports.RuntimeError).toBeDefined();
    expect(distExports.NoopQueryPreprocessor).toBeDefined();
    expect(distExports.PassthroughRetrievalPostprocessor).toBeDefined();
    expect(distExports.createDefaultPostprocessor).toBeDefined();
    expect(distExports.FanOutRetriever).toBeDefined();
    expect(distExports.StrategyQueryPreprocessor).toBeDefined();
    expect(distExports.StrategyRetrievalPostprocessor).toBeDefined();
    expect(distExports.createLostInTheMiddleStrategy).toBeDefined();
    expect(distExports.createQueryRewriteStrategy).toBeDefined();
    expect(distExports.createQueryExpansionStrategy).toBeDefined();
    expect(distExports.createQueryDecompositionStrategy).toBeDefined();
    expect(distExports.createMultiQueryStrategy).toBeDefined();
    expect(distExports.createQueryRoutingStrategy).toBeDefined();
    expect(distExports.createLlmRerankStrategy).toBeDefined();
    expect(distExports.createContextCompressionStrategy).toBeDefined();
    expect(distExports.applyRetrievalTopKAlias).toBeDefined();
    expect(distExports.resolveGenerationGrounding).toBeDefined();
    expect(distExports.createRuntimeFromConfig).toBeDefined();
    expect(distExports.assemblePostRetrievalStrategies).toBeDefined();
    expect(distExports.createRuntime).toBeDefined();
    expect(distExports.createDefaultRuntime).toBeDefined();
    expect(distExports.RuntimeStrategyModel).toBeUndefined();
    expect(typeof distExports.OpenAIStrategyModel).toBe('undefined');
  });

  it('does not leak internal helpers from the package root', () => {
    expect(distExports.applyScoreThresholdStrategy).toBeUndefined();
    expect(distExports.applyBudgetTrimStrategy).toBeUndefined();
    expect(distExports.parseRewrittenQuery).toBeUndefined();
    expect(distExports.parseQueryList).toBeUndefined();
    expect(distExports.buildRuntimeCitations).toBeUndefined();
    expect(distExports.buildPassthroughStrategies).toBeUndefined();
    expect(distExports.createRunnableRuntime).toBeUndefined();
    expect(distExports.iterateRuntimeGeneratorStream).toBeUndefined();
    expect(distExports.toRuntimeError).toBeUndefined();
    expect(distExports.createIndexingRetrievalCandidate).toBeUndefined();
    expect(distExports.fuseByReciprocalRankFusion).toBeUndefined();
    expect(distExports.enforceRetrievalRequestFilters).toBeUndefined();
  });

  it('exposes retriever contract helpers on the contract entry', () => {
    expect(distContract.createIndexingRetrievalCandidate).toBeDefined();
    expect(distContract.createIndexingRetrievalFilters).toBeDefined();
    expect(distContract.filterRetrievalCandidatesByIndexingFilters).toBeDefined();
    expect(distContract.enforceRetrievalRequestFilters).toBeDefined();
    expect(distContract.fuseByReciprocalRankFusion).toBeDefined();
  });

  it('preserves the intended public types', () => {
    expectTypeOf<RuntimeStage>().toEqualTypeOf<
      'pre-retrieval' | 'retrieval' | 'post-retrieval' | 'generation'
    >();
    expectTypeOf<RuntimeQueryInput>().toMatchObjectType<{
      query: string;
    }>();
    expectTypeOf<RetrievalRequest>().toHaveProperty('originalQuery');
    expectTypeOf<RetrievalCandidate>().toHaveProperty('chunk');
    expectTypeOf<RuntimeRunOptions>().toMatchObjectType<{
      includeDebug?: boolean;
      requestId?: string;
    }>();
    expectTypeOf<RuntimeResult>().toHaveProperty('answer');
    expectTypeOf<RuntimeResult>().toHaveProperty('citations');
    expectTypeOf<RuntimeResult>().toHaveProperty('counts');
    expectTypeOf<RuntimeResult>().toHaveProperty('retrievedCandidates');
    expectTypeOf<RuntimeResult>().toHaveProperty('requestId');
    expectTypeOf<RuntimeResult>().toHaveProperty('traceId');
    expectTypeOf<RuntimeSearchResult>().not.toHaveProperty('answer');
    expectTypeOf<RuntimeSearchResult>().toHaveProperty('chunks');
    expectTypeOf<RuntimeSearchResult>().toHaveProperty('citations');
    expectTypeOf<RuntimeSearchResult>().toHaveProperty('originalQuery');
    expectTypeOf<RuntimeCitation>().toMatchObjectType<{
      index: number;
      chunkId: string;
      sourceId?: string;
      score?: number;
      title?: string;
      hierarchyPath?: string;
      compressed?: boolean;
      originalContent?: string;
    }>();
    expectTypeOf<Runtime>().toHaveProperty('run');
    expectTypeOf<Runtime>().toHaveProperty('search');
    expectTypeOf<Runtime>().toHaveProperty('runStream');
    expectTypeOf<Runtime>().toHaveProperty('close');
  });
});
