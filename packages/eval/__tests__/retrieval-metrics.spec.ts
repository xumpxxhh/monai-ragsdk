import { describe, expect, it } from 'vitest';

import {
  aggregateRetrievalMetrics,
  buildSourceRanking,
  parseEvalDataset,
  safeParseEvalDataset,
  scoreRetrievalSample,
} from '../src/index.ts';

describe('parseEvalDataset', () => {
  it('accepts a valid dataset', () => {
    const dataset = parseEvalDataset({
      name: 'demo',
      version: '1.0.0',
      samples: [
        {
          id: 'q1',
          query: '什么是 RAG？',
          relevantSourceIds: ['doc-a'],
        },
      ],
    });

    expect(dataset.name).toBe('demo');
    expect(dataset.samples).toHaveLength(1);
  });

  it('rejects duplicate sample ids', () => {
    const result = safeParseEvalDataset({
      name: 'demo',
      version: '1.0.0',
      samples: [
        { id: 'dup', query: 'q1', relevantSourceIds: ['a'] },
        { id: 'dup', query: 'q2', relevantSourceIds: ['b'] },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty samples array', () => {
    const result = safeParseEvalDataset({
      name: 'demo',
      version: '1.0.0',
      samples: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects sample without relevantSourceIds', () => {
    const result = safeParseEvalDataset({
      name: 'demo',
      version: '1.0.0',
      samples: [{ id: 'q1', query: 'test', relevantSourceIds: [] }],
    });

    expect(result.success).toBe(false);
  });
});

describe('buildSourceRanking', () => {
  it('dedupes multiple chunks from the same source by first rank', () => {
    const ranking = buildSourceRanking(
      {
        retrieved: [
          { chunkId: 'c1', sourceId: 'doc-a', rank: 1 },
          { chunkId: 'c2', sourceId: 'doc-a', rank: 2 },
          { chunkId: 'c3', sourceId: 'doc-b', rank: 3 },
        ],
        selected: [],
      },
      'retrieved',
    );

    expect(ranking.rankedSources).toEqual([
      { sourceId: 'doc-a', rank: 1 },
      { sourceId: 'doc-b', rank: 3 },
    ]);
    expect(ranking.coverage).toBe(1);
  });

  it('computes partial coverage when some candidates lack sourceId', () => {
    const ranking = buildSourceRanking(
      {
        retrieved: [
          { chunkId: 'c1', rank: 1 },
          { chunkId: 'c2', sourceId: 'doc-a', rank: 2 },
          { chunkId: 'c3', rank: 3 },
          { chunkId: 'c4', sourceId: 'doc-b', rank: 4 },
        ],
        selected: [],
      },
      'retrieved',
    );

    expect(ranking.coverage).toBe(0.5);
    expect(ranking.scorableCandidates).toBe(2);
    expect(ranking.rankedSources).toEqual([
      { sourceId: 'doc-a', rank: 2 },
      { sourceId: 'doc-b', rank: 4 },
    ]);
  });

  it('marks zero coverage when all candidates lack sourceId', () => {
    const ranking = buildSourceRanking(
      {
        retrieved: [
          { chunkId: 'c1', rank: 1 },
          { chunkId: 'c2', rank: 2 },
        ],
        selected: [],
      },
      'retrieved',
    );

    expect(ranking.coverage).toBe(0);
    expect(ranking.rankedSources).toEqual([]);
  });
});

describe('scoreRetrievalSample', () => {
  const sample = {
    id: 'q1',
    query: 'test query',
    relevantSourceIds: ['doc-a', 'doc-b'],
  };

  it('computes recall, precision, hitRate, mrr and ndcg at k', () => {
    const score = scoreRetrievalSample(sample, {
      retrieved: [
        { chunkId: 'c1', sourceId: 'doc-a', rank: 1 },
        { chunkId: 'c2', sourceId: 'doc-b', rank: 2 },
        { chunkId: 'c3', sourceId: 'doc-c', rank: 3 },
      ],
      selected: [],
    });

    expect(score.unscorable).toBe(false);
    expect(score.mrr).toBe(1);

    const at3 = score.atK.find((entry) => entry.k === 3);
    expect(at3).toEqual({
      k: 3,
      recall: 1,
      precision: 2 / 3,
      hitRate: 1,
      ndcg: 1,
    });
  });

  it('returns mrr 0 when no relevant source is retrieved', () => {
    const score = scoreRetrievalSample(sample, {
      retrieved: [{ chunkId: 'c1', sourceId: 'doc-x', rank: 1 }],
      selected: [],
    });

    expect(score.mrr).toBe(0);
    expect(score.atK.find((entry) => entry.k === 1)?.hitRate).toBe(0);
  });

  it('marks sample unscorable when all candidates lack sourceId', () => {
    const score = scoreRetrievalSample(sample, {
      retrieved: [
        { chunkId: 'c1', rank: 1 },
        { chunkId: 'c2', rank: 2 },
      ],
      selected: [],
    });

    expect(score.unscorable).toBe(true);
    expect(score.coverage).toBe(0);
    expect(score.mrr).toBe(0);
  });

  it('scores selected layer by array order', () => {
    const score = scoreRetrievalSample(
      sample,
      {
        retrieved: [],
        selected: [
          { chunkId: 'c1', sourceId: 'doc-c' },
          { chunkId: 'c2', sourceId: 'doc-a' },
        ],
      },
      { layer: 'selected', k: [2] },
    );

    expect(score.layer).toBe('selected');
    expect(score.mrr).toBe(0.5);
    expect(score.atK[0]?.recall).toBe(0.5);
    expect(score.atK[0]?.precision).toBe(0.5);
    expect(score.atK[0]?.hitRate).toBe(1);
    expect(score.atK[0]?.ndcg).toBeCloseTo(0.3869, 3);
  });
});

describe('aggregateRetrievalMetrics', () => {
  it('macro-averages scorable samples and lists unscorable ids', () => {
    const scorable = scoreRetrievalSample(
      { id: 'q1', query: 'q', relevantSourceIds: ['a'] },
      {
        retrieved: [{ chunkId: 'c1', sourceId: 'a', rank: 1 }],
        selected: [],
      },
      { k: [1] },
    );
    const unscorable = scoreRetrievalSample(
      { id: 'q2', query: 'q', relevantSourceIds: ['b'] },
      {
        retrieved: [{ chunkId: 'c2', rank: 1 }],
        selected: [],
      },
      { k: [1] },
    );

    const report = aggregateRetrievalMetrics([scorable, unscorable], { k: [1] });

    expect(report.scoredSampleCount).toBe(1);
    expect(report.unscorableSampleCount).toBe(1);
    expect(report.unscorableSampleIds).toEqual(['q2']);
    expect(report.meanMrr).toBe(1);
    expect(report.meanAtK[0]).toEqual({
      k: 1,
      recall: 1,
      precision: 1,
      hitRate: 1,
      ndcg: 1,
    });
  });
});
