import type { PostRetrievalStrategy } from './post-retrieval-strategy.js';
import type { PassthroughRetrievalPostprocessorOptions } from './passthrough-retrieval-postprocessor-options.js';

import { buildPassthroughStrategies } from './passthrough-retrieval-postprocessor.js';
import { createLostInTheMiddleStrategy } from './strategies/lost-in-the-middle-strategy.js';

/**
 * 官方装配层采用的 post-retrieval 顺序。
 * llm-rerank 写回 `scoreKind: 'llm'`，必须在 score-threshold 之前，否则阈值仍按 retriever/RRF 分比较。
 * 默认链不含 rerank / compression / lost-in-the-middle，需显式配置才插入。
 */
export const POST_RETRIEVAL_ASSEMBLY_ORDER = [
  'llm-rerank',
  'score-threshold',
  'predicate-filter',
  'duplicate-removal',
  'budget-trim',
  'source-coverage',
  'context-ordering',
  'context-compression',
  'lost-in-the-middle',
] as const;

export type AssemblePostRetrievalStrategiesConfig = PassthroughRetrievalPostprocessorOptions & {
  /**
   * 插在 score-threshold 之前。不配则默认链不含 rerank。
   */
  rerank?: PostRetrievalStrategy;
  /**
   * 插在 coverage / ordering 之后。不配则不含 compression。
   */
  compression?: PostRetrievalStrategy;
  /** true 时追加 lost-in-the-middle（只重排不丢弃）。 */
  lostInTheMiddle?: boolean;
  /**
   * 完全覆盖官方顺序。调用方自行保证 rerank 与 threshold 的协作；装配层不再重排。
   */
  strategies?: PostRetrievalStrategy[];
};

/**
 * 按官方顺序编译 post-retrieval 策略数组。
 * 有 `strategies` 时原样返回，避免把调用方自定义链再改一遍。
 */
export function assemblePostRetrievalStrategies(
  config: AssemblePostRetrievalStrategiesConfig = {},
): PostRetrievalStrategy[] {
  if (config.strategies) {
    return config.strategies;
  }

  const { rerank, compression, lostInTheMiddle, ...passthrough } = config;
  const strategies: PostRetrievalStrategy[] = [];

  if (rerank) {
    strategies.push(rerank);
  }

  strategies.push(...buildPassthroughStrategies(passthrough));

  if (compression) {
    strategies.push(compression);
  }

  if (lostInTheMiddle) {
    strategies.push(createLostInTheMiddleStrategy());
  }

  return strategies;
}
