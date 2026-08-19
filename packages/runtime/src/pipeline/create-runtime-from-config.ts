import type { RAGObserver } from '@monai-ragsdk/observability';

import type { QueryPreprocessor } from '../stages/pre-retrieval/query-preprocessor.js';
import type { QueryStrategy } from '../stages/pre-retrieval/query-strategy.js';
import type { RetrievalPostprocessor } from '../stages/post-retrieval/retrieval-postprocessor.js';
import type { RuntimeGenerator } from '../stages/generation/runtime-generator.js';
import type { RuntimeRetriever } from '../stages/retrieval/runtime-retriever.js';
import type { Runtime } from '../types/index.js';

import { NoopQueryPreprocessor } from '../stages/pre-retrieval/noop-query-preprocessor.js';
import { StrategyQueryPreprocessor } from '../stages/pre-retrieval/strategy-query-preprocessor.js';
import {
  assemblePostRetrievalStrategies,
  type AssemblePostRetrievalStrategiesConfig,
} from '../stages/post-retrieval/assemble-post-retrieval-strategies.js';
import { StrategyRetrievalPostprocessor } from '../stages/post-retrieval/strategy-retrieval-postprocessor.js';
import {
  FanOutRetriever,
  type FanOutRetrieverOptions,
} from '../stages/retrieval/fan-out-retriever.js';
import { createRuntime } from './create-runtime.js';

export type RuntimeQueryStageConfig = {
  base?: QueryPreprocessor;
  /** 按数组顺序执行 rewrite / expansion / routing 等；缺省为空。 */
  strategies?: QueryStrategy[];
};

export type RuntimePostRetrievalStageConfig = AssemblePostRetrievalStrategiesConfig & {
  debug?: boolean;
};

export type CreateRuntimeFromConfigOptions = {
  retriever: RuntimeRetriever;
  generator: RuntimeGenerator;
  observer?: RAGObserver;
  query?: RuntimeQueryStageConfig;
  postRetrieval?: RuntimePostRetrievalStageConfig;
  /**
   * 包一层 FanOut：有 subQueries 时多路召回。默认 true。
   * 传入对象时作为 FanOut 选项（仍用上面的 retriever 当子检索器）。
   * 已是 FanOutRetriever 时不再套一层，避免对 subQueries 双重 fan-out。
   */
  fanOut?: boolean | Omit<FanOutRetrieverOptions, 'retriever' | 'retrievers'>;
  /** 覆盖编译出的 preprocessor（跳过 query 配置）。 */
  preprocessor?: QueryPreprocessor;
  /** 覆盖编译出的 postprocessor（跳过 postRetrieval 配置）。 */
  postprocessor?: RetrievalPostprocessor;
};

function resolvePreprocessor(
  override: QueryPreprocessor | undefined,
  query: RuntimeQueryStageConfig | undefined,
): QueryPreprocessor {
  if (override) {
    return override;
  }

  if (!query) {
    return new NoopQueryPreprocessor();
  }

  return new StrategyQueryPreprocessor({
    base: query.base,
    strategies: query.strategies ?? [],
  });
}

function resolveRetriever(
  retriever: RuntimeRetriever,
  fanOut: CreateRuntimeFromConfigOptions['fanOut'],
): RuntimeRetriever {
  if (fanOut === false) {
    return retriever;
  }

  if (retriever instanceof FanOutRetriever) {
    return retriever;
  }

  const fanOutOptions = typeof fanOut === 'object' ? fanOut : {};
  return new FanOutRetriever({
    ...fanOutOptions,
    retriever,
  });
}

function resolvePostprocessor(
  override: RetrievalPostprocessor | undefined,
  postRetrieval: RuntimePostRetrievalStageConfig | undefined,
): RetrievalPostprocessor {
  if (override) {
    return override;
  }

  const { debug, includeSelectionTrace, ...assembleConfig } = postRetrieval ?? {};

  return new StrategyRetrievalPostprocessor({
    strategies: assemblePostRetrievalStrategies(assembleConfig),
    includeSelectionTrace: includeSelectionTrace ?? debug,
    buildPromptContext: postRetrieval?.buildPromptContext,
  });
}

/**
 * 按配置编译 Runtime，收拢「策略数组 + FanOut + 默认 post 链」的手拼。
 * 原子拼装仍用 `createRuntime` / `createDefaultRuntime`。
 * 不落地 routeDecision；llm-rerank 只有 `postRetrieval.rerank` 显式传入才进链，并插在 threshold 前。
 */
export function createRuntimeFromConfig(options: CreateRuntimeFromConfigOptions): Runtime {
  return createRuntime({
    preprocessor: resolvePreprocessor(options.preprocessor, options.query),
    retriever: resolveRetriever(options.retriever, options.fanOut),
    postprocessor: resolvePostprocessor(options.postprocessor, options.postRetrieval),
    generator: options.generator,
    observer: options.observer,
  });
}
