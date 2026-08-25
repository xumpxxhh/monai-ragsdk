import type {
  AggregatedRetrievalMetrics,
  AggregateRetrievalMetricsOptions,
  RetrievalSampleScore,
} from '../types/retrieval-metrics.js';

import { DEFAULT_RETRIEVAL_K } from './retrieval-metrics.js';

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * 对多样本评分做 macro 平均；unscorable 样本从分母剔除并单列 id。
 * 要求传入的 scores 来自同一 layer；layer 不一致时以第一条为准。
 */
export function aggregateRetrievalMetrics(
  scores: RetrievalSampleScore[],
  options: AggregateRetrievalMetricsOptions = {},
): AggregatedRetrievalMetrics {
  const kValues = options.k ?? [...DEFAULT_RETRIEVAL_K];
  const layer = scores[0]?.layer ?? 'retrieved';
  const scorable = scores.filter((score) => !score.unscorable);
  const unscorable = scores.filter((score) => score.unscorable);

  const meanAtK = kValues.map((k) => {
    const slice = scorable
      .map((score) => score.atK.find((entry) => entry.k === k))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

    return {
      k,
      recall: mean(slice.map((entry) => entry.recall)),
      precision: mean(slice.map((entry) => entry.precision)),
      hitRate: mean(slice.map((entry) => entry.hitRate)),
      ndcg: mean(slice.map((entry) => entry.ndcg)),
    };
  });

  return {
    layer,
    scoredSampleCount: scorable.length,
    unscorableSampleCount: unscorable.length,
    unscorableSampleIds: unscorable.map((score) => score.sampleId),
    meanMrr: mean(scorable.map((score) => score.mrr)),
    meanAtK,
  };
}
