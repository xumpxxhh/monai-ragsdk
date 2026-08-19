import type {
  RuntimeContext,
  RuntimeStrategyModel,
  RuntimeStrategyModelInput,
} from '../../../types/index.js';

import type { QueryStrategyErrorMode } from './llm-query-strategy-options.js';

/**
 * 调用策略模型；默认吞掉失败以便检索仍能用原始 query。
 * onError 为 throw 时原样抛出，由 preprocessor 阶段包装。
 */
export async function completeQueryStrategyModel(
  model: RuntimeStrategyModel,
  input: RuntimeStrategyModelInput,
  context: RuntimeContext,
  onError: QueryStrategyErrorMode = 'passthrough',
): Promise<string | undefined> {
  try {
    const text = await model.complete(input, context);
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (error) {
    if (onError === 'throw') {
      throw error;
    }

    return undefined;
  }
}

/** 空字符串没有检索意图，调用 LLM 只会增加费用；策略应直接透传。 */
export function isBlankEffectiveQuery(query: string): boolean {
  return query.trim().length === 0;
}
