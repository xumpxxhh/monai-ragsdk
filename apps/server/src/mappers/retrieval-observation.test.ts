import { describe, expect, it } from 'vitest';

import { toRetrievalObservation } from './retrieval-observation.js';

describe('toRetrievalObservation', () => {
  it('maps retrievedCandidates rank and selected chunks with citation sourceId', () => {
    const observation = toRetrievalObservation({
      answer: '',
      chunks: [
        { id: 'c2', content: 'b', metadata: { sourceId: 'doc-b' } },
        { id: 'c1', content: 'a', metadata: { sourceId: 'doc-a' } },
      ],
      citations: [
        { index: 1, chunkId: 'c2', sourceId: 'doc-b', score: 0.8 },
        { index: 2, chunkId: 'c1', sourceId: 'doc-a', score: 0.7 },
      ],
      originalQuery: { query: 'q' },
      effectiveQuery: { query: 'q' },
      retrievedCandidates: [
        { chunkId: 'c1', sourceId: 'doc-a', score: 0.9 },
        { chunkId: 'c3', sourceId: 'doc-c', score: 0.5 },
      ],
    });

    expect(observation.retrieved).toEqual([
      { chunkId: 'c1', sourceId: 'doc-a', score: 0.9, rank: 1 },
      { chunkId: 'c3', sourceId: 'doc-c', score: 0.5, rank: 2 },
    ]);
    expect(observation.selected).toEqual([
      { chunkId: 'c2', sourceId: 'doc-b' },
      { chunkId: 'c1', sourceId: 'doc-a' },
    ]);
  });

  it('falls back to chunk metadata when citation lacks sourceId', () => {
    const observation = toRetrievalObservation({
      answer: '',
      chunks: [{ id: 'c1', content: 'a', metadata: { sourceId: 'doc-from-meta' } }],
      citations: [{ index: 1, chunkId: 'c1' }],
      originalQuery: { query: 'q' },
      effectiveQuery: { query: 'q' },
      retrievedCandidates: [{ chunkId: 'c1' }],
    });

    expect(observation.selected[0]).toEqual({
      chunkId: 'c1',
      sourceId: 'doc-from-meta',
    });
    expect(observation.retrieved[0]).toEqual({
      chunkId: 'c1',
      rank: 1,
    });
  });
});
