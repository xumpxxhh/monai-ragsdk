import { describe, expect, it } from 'vitest';

import { diffRetrievalEvalReports } from '../src/metrics/diff-retrieval-eval.js';

describe('diffRetrievalEvalReports', () => {
  it('marks sample improved when candidate mrr is higher', () => {
    const baseline = {
      sampleId: 'q1',
      layer: 'retrieved' as const,
      coverage: 1,
      unscorable: false,
      mrr: 0.5,
      atK: [{ k: 3, recall: 0.5, precision: 0.5, hitRate: 1, ndcg: 0.5 }],
    };
    const candidate = {
      ...baseline,
      mrr: 1,
      atK: [{ k: 3, recall: 1, precision: 1, hitRate: 1, ndcg: 1 }],
    };

    const report = diffRetrievalEvalReports({
      baselineLabel: 'A',
      candidateLabel: 'B',
      baseline: {
        samples: [baseline],
        aggregate: {
          layer: 'retrieved',
          scoredSampleCount: 1,
          unscorableSampleCount: 0,
          unscorableSampleIds: [],
          meanMrr: 0.5,
          meanAtK: [{ k: 3, recall: 0.5, precision: 0.5, hitRate: 1, ndcg: 0.5 }],
        },
      },
      candidate: {
        samples: [candidate],
        aggregate: {
          layer: 'retrieved',
          scoredSampleCount: 1,
          unscorableSampleCount: 0,
          unscorableSampleIds: [],
          meanMrr: 1,
          meanAtK: [{ k: 3, recall: 1, precision: 1, hitRate: 1, ndcg: 1 }],
        },
      },
      k: [3],
      primaryK: 3,
    });

    expect(report.improvedSampleIds).toEqual(['q1']);
    expect(report.aggregateDelta.meanMrrDelta).toBe(0.5);
    expect(report.sampleDiffs[0]?.verdict).toBe('improved');
  });

  it('marks sample incomparable when either arm is unscorable', () => {
    const baseline = {
      sampleId: 'q1',
      layer: 'retrieved' as const,
      coverage: 0,
      unscorable: true,
      mrr: 0,
      atK: [{ k: 1, recall: 0, precision: 0, hitRate: 0, ndcg: 0 }],
    };
    const candidate = {
      sampleId: 'q1',
      layer: 'retrieved' as const,
      coverage: 1,
      unscorable: false,
      mrr: 1,
      atK: [{ k: 1, recall: 1, precision: 1, hitRate: 1, ndcg: 1 }],
    };

    const report = diffRetrievalEvalReports({
      baselineLabel: 'A',
      candidateLabel: 'B',
      baseline: {
        samples: [baseline],
        aggregate: {
          layer: 'retrieved',
          scoredSampleCount: 0,
          unscorableSampleCount: 1,
          unscorableSampleIds: ['q1'],
          meanMrr: 0,
          meanAtK: [{ k: 1, recall: 0, precision: 0, hitRate: 0, ndcg: 0 }],
        },
      },
      candidate: {
        samples: [candidate],
        aggregate: {
          layer: 'retrieved',
          scoredSampleCount: 1,
          unscorableSampleCount: 0,
          unscorableSampleIds: [],
          meanMrr: 1,
          meanAtK: [{ k: 1, recall: 1, precision: 1, hitRate: 1, ndcg: 1 }],
        },
      },
      k: [1],
    });

    expect(report.incomparableSampleIds).toEqual(['q1']);
    expect(report.sampleDiffs[0]?.mrrDelta).toBeNull();
  });

  it('uses recall at primaryK as tie-breaker when mrr is equal', () => {
    const baseline = {
      sampleId: 'q1',
      layer: 'retrieved' as const,
      coverage: 1,
      unscorable: false,
      mrr: 1,
      atK: [{ k: 5, recall: 0.5, precision: 0.5, hitRate: 1, ndcg: 0.5 }],
    };
    const candidate = {
      ...baseline,
      atK: [{ k: 5, recall: 1, precision: 1, hitRate: 1, ndcg: 1 }],
    };

    const report = diffRetrievalEvalReports({
      baselineLabel: 'A',
      candidateLabel: 'B',
      baseline: {
        samples: [baseline],
        aggregate: {
          layer: 'retrieved',
          scoredSampleCount: 1,
          unscorableSampleCount: 0,
          unscorableSampleIds: [],
          meanMrr: 1,
          meanAtK: baseline.atK,
        },
      },
      candidate: {
        samples: [candidate],
        aggregate: {
          layer: 'retrieved',
          scoredSampleCount: 1,
          unscorableSampleCount: 0,
          unscorableSampleIds: [],
          meanMrr: 1,
          meanAtK: candidate.atK,
        },
      },
      k: [5],
      primaryK: 5,
    });

    expect(report.improvedSampleIds).toEqual(['q1']);
  });
});
