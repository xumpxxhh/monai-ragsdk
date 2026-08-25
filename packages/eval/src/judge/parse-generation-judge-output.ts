import { GenerationJudgeLlmOutputSchema } from '../spec/generation-judge.js';
import type { GenerationJudgeLlmOutput } from '../types/generation-judge.js';

import { extractJsonValue } from './extract-json.js';

export type ParseGenerationJudgeLlmResult =
  | { success: true; data: GenerationJudgeLlmOutput }
  | { success: false; error: string };

/**
 * 把 LLM 原文解析为 GenerationJudgeLlmOutput。
 * 失败不抛错，让 harness 把样本标 unscorable 而不是中断整批。
 */
export function safeParseGenerationJudgeLlmOutput(text: string): ParseGenerationJudgeLlmResult {
  const json = extractJsonValue(text);
  if (json === undefined) {
    return { success: false, error: 'judge 输出不是合法 JSON' };
  }

  const parsed = GenerationJudgeLlmOutputSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((issue) => issue.message).join('; '),
    };
  }

  return { success: true, data: parsed.data };
}

/** 严格解析；失败抛错。批量跑分请用 safeParse。 */
export function parseGenerationJudgeLlmOutput(text: string): GenerationJudgeLlmOutput {
  const parsed = safeParseGenerationJudgeLlmOutput(text);
  if (!parsed.success) {
    throw new Error(parsed.error);
  }

  return parsed.data;
}
