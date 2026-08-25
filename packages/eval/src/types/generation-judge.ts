import type { z } from 'zod';

import type {
  GenerationJudgeContextSchema,
  GenerationJudgeInputSchema,
  GenerationJudgeLlmOutputSchema,
  GenerationJudgeScoreSchema,
} from '../spec/generation-judge.js';

export type GenerationJudgeContext = z.infer<typeof GenerationJudgeContextSchema>;
export type GenerationJudgeInput = z.infer<typeof GenerationJudgeInputSchema>;
export type GenerationJudgeLlmOutput = z.infer<typeof GenerationJudgeLlmOutputSchema>;
export type GenerationJudgeScore = z.infer<typeof GenerationJudgeScoreSchema>;

/** 多样本生成 judge 的 macro 聚合；各维只对非 null 样本取平均。 */
export type AggregatedGenerationJudgeMetrics = {
  scoredSampleCount: number;
  unscorableSampleCount: number;
  unscorableSampleIds: string[];
  meanFaithfulness: number | null;
  meanRelevance: number | null;
  meanRefusalCorrectness: number | null;
  faithfulnessSampleCount: number;
  relevanceSampleCount: number;
  refusalSampleCount: number;
};
