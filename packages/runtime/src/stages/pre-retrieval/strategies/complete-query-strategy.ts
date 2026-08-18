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
