import type { GenerationJudgeInput, GenerationJudgeScore } from '../types/generation-judge.js';

import { safeParseGenerationJudgeLlmOutput } from './parse-generation-judge-output.js';
import { scoreRefusalCorrectness } from './score-refusal-correctness.js';

/**
 * 把 LLM 原文与拒答纯函数合成单样本分数。
 * 无检索上下文时忠实度记 null（没有可对照依据，不能当 0 分掺进聚合）。
 * LLM 解析失败时忠实度/相关性为 null，拒答维仍可单独计分。
 */
export function scoreGenerationJudgeSample(
  input: GenerationJudgeInput,
  llmText: string | undefined,
): GenerationJudgeScore {
  const refusalCorrectness = scoreRefusalCorrectness(input.expectedRefusal, input.refused);
  const parsed =
    typeof llmText === 'string' && llmText.trim().length > 0
      ? safeParseGenerationJudgeLlmOutput(llmText)
      : undefined;

  let faithfulness: number | null = null;
  let relevance: number | null = null;
  let rationale: string | undefined;
  let parseError: string | undefined;

  if (!parsed) {
    parseError = 'missing judge output';
  } else if (!parsed.success) {
    parseError = parsed.error;
  } else {
    faithfulness = parsed.data.faithfulness;
    relevance = parsed.data.relevance;
    rationale = parsed.data.rationale;
  }

  if (input.contexts.length === 0) {
    faithfulness = null;
  }

  const unscorable = faithfulness === null && relevance === null && refusalCorrectness === null;

  return {
    sampleId: input.sampleId,
    faithfulness,
    relevance,
    refusalCorrectness,
    unscorable,
    ...(rationale ? { rationale } : {}),
    ...(parseError ? { parseError } : {}),
  };
}
