import { describe, expect, it } from 'vitest';

import { mapKnowledgeSearchResult } from './search-result.js';
import type { RuntimeSearchResult } from '@monai-ragsdk/runtime';

function mockSearchResult(overrides: Partial<RuntimeSearchResult> = {}): RuntimeSearchResult {
  return {
    chunks: [
      {
        id: 'chunk-1',
        content: '退货政策正文：七日内可无理由退货，请保留完整包装。',
        metadata: { sourceId: 'return-policy.md', title: '退货政策' },
      },
    ],
    citations: [
      {
        index: 1,
        chunkId: 'chunk-1',
        sourceId: 'return-policy.md',
        title: '退货政策',
        score: 0.88,
      },
    ],
    originalQuery: { query: '退货多久？' },
    effectiveQuery: { query: '退货时效是多久？' },
    requestId: 'req-1',
    traceId: 'trace-1',
    startedAt: Date.now(),
    endedAt: Date.now(),
    counts: {
      retrieved: 3,
      selected: 1,
      dropped: 2,
      finalChunks: 1,
    },
    ...overrides,
  };
}

describe('mapKnowledgeSearchResult', () => {
  it('returns full chunk content instead of snippet', () => {
    const mapped = mapKnowledgeSearchResult(
      mockSearchResult(),
      '退货多久？',
      8,
      'kb-demo',
    );

    expect(mapped.hits[0]?.content).toContain('七日内可无理由退货');
    expect(mapped.hits[0]?.content).not.toContain('…');
    expect(mapped.hits[0]?.collectionId).toBe('kb-demo');
    expect(mapped.hits[0]?.sourceId).toBe('return-policy.md');
    expect(mapped.effectiveQuery).toBe('退货时效是多久？');
    expect(mapped.grounding.empty).toBe(false);
  });

  it('marks empty grounding with chunksEmptyReason when filtered', () => {
    const mapped = mapKnowledgeSearchResult(
      mockSearchResult({
        chunks: [],
        citations: [],
        counts: {
          retrieved: 2,
          selected: 0,
          dropped: 2,
          finalChunks: 0,
        },
      }),
      '不存在的问题',
      5,
    );

    expect(mapped.hits).toEqual([]);
    expect(mapped.grounding.empty).toBe(true);
    expect(mapped.grounding.chunksEmptyReason).toBe('filtered');
  });

  it('omits pipeline and executionTrace fields', () => {
    const mapped = mapKnowledgeSearchResult(mockSearchResult(), 'q', 5);
    expect(mapped).not.toHaveProperty('pipeline');
    expect(mapped).not.toHaveProperty('executionTrace');
    expect(mapped).not.toHaveProperty('appliedFilters');
  });
});
