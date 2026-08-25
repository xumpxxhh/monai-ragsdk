import type { EvalSample } from '../types/eval-sample.js';
import type { RetrievalObservation } from '../types/retrieval-observation.js';
import type {
  RetrievalSampleScore,
  ScoreRetrievalSampleOptions,
} from '../types/retrieval-metrics.js';

import { computeMetricsAtK, DEFAULT_RETRIEVAL_K, meanReciprocalRank } from './retrieval-metrics.js';
import { buildSourceRanking, isUnscorableRanking } from './source-ranking.js';

/**
 * 对单条 golden 样本与检索观测打分。
 * unscorable 时仍返回 coverage 与空指标占位，mrr/atK 为 0。
 */
export function scoreRetrievalSample(
  sample: EvalSample,
  observation: RetrievalObservation,
  options: ScoreRetrievalSampleOptions = {},
): RetrievalSampleScore {
  const layer = options.layer ?? 'retrieved';
  const kValues = options.k ?? [...DEFAULT_RETRIEVAL_K];
  const ranking = buildSourceRanking(observation, layer);
  const unscorable = isUnscorableRanking(ranking);

  if (unscorable) {
    return {
      sampleId: sample.id,
      layer,
      coverage: ranking.coverage,
      unscorable: true,
      mrr: 0,
      atK: kValues.map((k) => ({
        k,
        recall: 0,
        precision: 0,
        hitRate: 0,
        ndcg: 0,
      })),
    };
  }

  const mrr = meanReciprocalRank(ranking.rankedSources, sample.relevantSourceIds);
  const atK = kValues.map((k) =>
    computeMetricsAtK(ranking.rankedSources, sample.relevantSourceIds, k),
  );

  return {
    sampleId: sample.id,
    layer,
    coverage: ranking.coverage,
    unscorable: false,
    mrr,
    atK,
  };
}
