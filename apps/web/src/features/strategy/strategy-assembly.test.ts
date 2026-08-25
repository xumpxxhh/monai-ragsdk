import { describe, expect, it } from 'vitest';
import type { StrategyConfig } from '@/shared/types';
import {
  countPostRetrievalEnabled,
  countPreRetrievalEnabled,
  POST_RETRIEVAL_CONTROLS,
  stageEnabledCounts,
} from './strategy-assembly';

const baseConfig: StrategyConfig = {
  collectionId: 'global',
  preset: 'balanced',
  preRetrieval: {
    rewrite: true,
    expansion: false,
    decomposition: false,
    multiQuery: false,
    routing: false,
  },
  retrieval: { topK: 8 },
  postRetrieval: {
    scoreThreshold: true,
    scoreThresholdValue: 0.2,
    dedupe: true,
    contextBudget: true,
    contextBudgetMax: 5,
    sourceCoverage: false,
    rerank: true,
    compression: true,
    lostInMiddle: false,
  },
  generation: {
    citations: true,
    activeRag: false,
    noGroundingPolicy: 'explicit',
  },
};

describe('strategy-assembly', () => {
  it('counts pre-retrieval switches', () => {
    expect(countPreRetrievalEnabled(baseConfig.preRetrieval)).toBe(1);
  });

  it('counts post-retrieval in display order', () => {
    expect(countPostRetrievalEnabled(baseConfig.postRetrieval)).toBe(5);
    expect(POST_RETRIEVAL_CONTROLS).toHaveLength(7);
  });

  it('aggregates stage counts for pipeline bar', () => {
    const counts = stageEnabledCounts(baseConfig);
    expect(counts['pre-retrieval']).toBe(1);
    expect(counts.retrieval).toBe(1);
    expect(counts['post-retrieval']).toBe(5);
    expect(counts.generation).toBe(2);
  });
});
