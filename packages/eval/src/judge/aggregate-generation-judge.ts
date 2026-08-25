import type {
  AggregatedGenerationJudgeMetrics,
  GenerationJudgeScore,
} from '../types/generation-judge.js';

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compact(values: Array<number | null>): number[] {
  return values.filter((value): value is number => value !== null);
}

/**
 * 对多样本生成 judge 做 macro 平均。
 * unscorable 样本从分母剔除；各维只对非 null 取值，因此忠实度与拒答的分母可以不同。
 */
export function aggregateGenerationJudgeScores(
  scores: GenerationJudgeScore[],
): AggregatedGenerationJudgeMetrics {
  const scorable = scores.filter((score) => !score.unscorable);
  const unscorable = scores.filter((score) => score.unscorable);
  const faithfulnessValues = compact(scorable.map((score) => score.faithfulness));
  const relevanceValues = compact(scorable.map((score) => score.relevance));
  const refusalValues = compact(scorable.map((score) => score.refusalCorrectness));

  return {
    scoredSampleCount: scorable.length,
    unscorableSampleCount: unscorable.length,
    unscorableSampleIds: unscorable.map((score) => score.sampleId),
    meanFaithfulness: mean(faithfulnessValues),
    meanRelevance: mean(relevanceValues),
    meanRefusalCorrectness: mean(refusalValues),
    faithfulnessSampleCount: faithfulnessValues.length,
    relevanceSampleCount: relevanceValues.length,
    refusalSampleCount: refusalValues.length,
  };
}
