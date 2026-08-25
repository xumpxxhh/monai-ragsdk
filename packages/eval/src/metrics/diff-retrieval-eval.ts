import type {
  AggregatedRetrievalMetrics,
  RetrievalMetricsAtK,
  RetrievalSampleScore,
} from '../types/retrieval-metrics.js';

import { DEFAULT_RETRIEVAL_K } from './retrieval-metrics.js';

const EPS = 1e-9;

export type SampleDiffVerdict = 'improved' | 'regressed' | 'unchanged' | 'incomparable';

export type RetrievalMetricsAtKDelta = {
  k: number;
  recallDelta: number | null;
  precisionDelta: number | null;
  hitRateDelta: number | null;
  ndcgDelta: number | null;
};

export type RetrievalSampleDiff = {
  sampleId: string;
  verdict: SampleDiffVerdict;
  baseline: RetrievalSampleScore;
  candidate: RetrievalSampleScore;
  mrrDelta: number | null;
  atKDelta: RetrievalMetricsAtKDelta[];
};

export type RetrievalEvalDiffReport = {
  baselineLabel: string;
  candidateLabel: string;
  primaryK: number;
  aggregateDelta: {
    meanMrrDelta: number;
    meanAtKDelta: RetrievalMetricsAtKDelta[];
    scoredSampleCountDelta: number;
    unscorableSampleCountDelta: number;
  };
  sampleDiffs: RetrievalSampleDiff[];
  improvedSampleIds: string[];
  regressedSampleIds: string[];
  unchangedSampleIds: string[];
  incomparableSampleIds: string[];
};

export type DiffRetrievalEvalInput = {
  baselineLabel: string;
  candidateLabel: string;
  baseline: {
    samples: RetrievalSampleScore[];
    aggregate: AggregatedRetrievalMetrics;
  };
  candidate: {
    samples: RetrievalSampleScore[];
    aggregate: AggregatedRetrievalMetrics;
  };
  /** 样本 verdict 在 MRR 持平时用 recall@primaryK 破 tie；默认取 k 列表最大值。 */
  primaryK?: number;
  k?: number[];
};

function deltaOrNull(baseline: number, candidate: number): number | null {
  return candidate - baseline;
}

function metricsDeltaAtK(
  baseline: RetrievalMetricsAtK | undefined,
  candidate: RetrievalMetricsAtK | undefined,
): RetrievalMetricsAtKDelta {
  const k = baseline?.k ?? candidate?.k ?? 0;

  if (!baseline || !candidate) {
    return {
      k,
      recallDelta: null,
      precisionDelta: null,
      hitRateDelta: null,
      ndcgDelta: null,
    };
  }

  return {
    k,
    recallDelta: deltaOrNull(baseline.recall, candidate.recall),
    precisionDelta: deltaOrNull(baseline.precision, candidate.precision),
    hitRateDelta: deltaOrNull(baseline.hitRate, candidate.hitRate),
    ndcgDelta: deltaOrNull(baseline.ndcg, candidate.ndcg),
  };
}

function resolvePrimaryK(k: number[] | undefined, primaryK: number | undefined): number {
  if (typeof primaryK === 'number' && primaryK > 0) {
    return primaryK;
  }

  const values = k && k.length > 0 ? k : [...DEFAULT_RETRIEVAL_K];
  return Math.max(...values);
}

/** 单样本 verdict：先看 MRR，持平时看 primaryK 的 recall。 */
export function compareRetrievalSampleDiff(
  baseline: RetrievalSampleScore,
  candidate: RetrievalSampleScore,
  primaryK: number,
): RetrievalSampleDiff {
  if (baseline.unscorable || candidate.unscorable) {
    return {
      sampleId: baseline.sampleId,
      verdict: 'incomparable',
      baseline,
      candidate,
      mrrDelta: null,
      atKDelta: baseline.atK.map((entry) =>
        metricsDeltaAtK(entry, candidate.atK.find((item) => item.k === entry.k)),
      ),
    };
  }

  const mrrDelta = candidate.mrr - baseline.mrr;
  const atKDelta = baseline.atK.map((entry) =>
    metricsDeltaAtK(entry, candidate.atK.find((item) => item.k === entry.k)),
  );

  let verdict: SampleDiffVerdict = 'unchanged';
  if (mrrDelta > EPS) {
    verdict = 'improved';
  } else if (mrrDelta < -EPS) {
    verdict = 'regressed';
  } else {
    const baselineRecall = baseline.atK.find((entry) => entry.k === primaryK)?.recall ?? 0;
    const candidateRecall = candidate.atK.find((entry) => entry.k === primaryK)?.recall ?? 0;
    const recallDelta = candidateRecall - baselineRecall;
    if (recallDelta > EPS) {
      verdict = 'improved';
    } else if (recallDelta < -EPS) {
      verdict = 'regressed';
    }
  }

  return {
    sampleId: baseline.sampleId,
    verdict,
    baseline,
    candidate,
    mrrDelta,
    atKDelta,
  };
}

/**
 * 对两套检索评测结果做样本级与 aggregate 级 diff。
 * 要求 baseline / candidate samples 按相同 sampleId 集合对齐。
 */
export function diffRetrievalEvalReports(input: DiffRetrievalEvalInput): RetrievalEvalDiffReport {
  const kValues =
    input.k ??
    input.baseline.aggregate.meanAtK.map((entry) => entry.k).filter((value) => value > 0);
  const primaryK = resolvePrimaryK(kValues, input.primaryK);

  const candidateById = new Map(input.candidate.samples.map((sample) => [sample.sampleId, sample]));
  const sampleDiffs: RetrievalSampleDiff[] = [];

  for (const baselineSample of input.baseline.samples) {
    const candidateSample = candidateById.get(baselineSample.sampleId);
    if (!candidateSample) {
      throw new Error(`candidate 缺少样本 ${baselineSample.sampleId}`);
    }

    sampleDiffs.push(compareRetrievalSampleDiff(baselineSample, candidateSample, primaryK));
  }

  const improvedSampleIds = sampleDiffs
    .filter((item) => item.verdict === 'improved')
    .map((item) => item.sampleId);
  const regressedSampleIds = sampleDiffs
    .filter((item) => item.verdict === 'regressed')
    .map((item) => item.sampleId);
  const unchangedSampleIds = sampleDiffs
    .filter((item) => item.verdict === 'unchanged')
    .map((item) => item.sampleId);
  const incomparableSampleIds = sampleDiffs
    .filter((item) => item.verdict === 'incomparable')
    .map((item) => item.sampleId);

  const meanAtKDelta = kValues.map((k) =>
    metricsDeltaAtK(
      input.baseline.aggregate.meanAtK.find((entry) => entry.k === k),
      input.candidate.aggregate.meanAtK.find((entry) => entry.k === k),
    ),
  );

  return {
    baselineLabel: input.baselineLabel,
    candidateLabel: input.candidateLabel,
    primaryK,
    aggregateDelta: {
      meanMrrDelta: input.candidate.aggregate.meanMrr - input.baseline.aggregate.meanMrr,
      meanAtKDelta,
      scoredSampleCountDelta:
        input.candidate.aggregate.scoredSampleCount - input.baseline.aggregate.scoredSampleCount,
      unscorableSampleCountDelta:
        input.candidate.aggregate.unscorableSampleCount -
        input.baseline.aggregate.unscorableSampleCount,
    },
    sampleDiffs,
    improvedSampleIds,
    regressedSampleIds,
    unchangedSampleIds,
    incomparableSampleIds,
  };
}
