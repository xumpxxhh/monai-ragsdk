import type { RuntimeStrategyModel } from '@monai-ragsdk/runtime';
import {
  FanOutRetriever,
  NoopQueryPreprocessor,
  StrategyQueryPreprocessor,
  StrategyRetrievalPostprocessor,
  createContextCompressionStrategy,
  createDefaultRuntime,
  createLlmRerankStrategy,
  createLostInTheMiddleStrategy,
  createMultiQueryStrategy,
  createNearDuplicateRemovalStrategy,
  createQueryDecompositionStrategy,
  createQueryExpansionStrategy,
  createQueryRewriteStrategy,
  createQueryRoutingStrategy,
  createScoreThresholdStrategy,
  createBudgetTrimStrategy,
  createSourceCoverageStrategy,
  type QueryStrategy,
  type PostRetrievalStrategy,
  type QueryPreprocessor,
  type Runtime,
  type RuntimeGenerator,
  type RuntimeRetriever,
} from '@monai-ragsdk/runtime';
import type { RAGObserver } from '@monai-ragsdk/observability';

import type { StrategyConfig } from '../types/api.js';

/**
 * 把控制台策略开关编译成 runtime preprocessor / retriever / postprocessor。
 * Active RAG 开关被忽略（路线图冻结）；失败策略默认透传，避免拖死主问答。
 */
export function buildRuntime(options: {
  strategy: StrategyConfig;
  retriever: RuntimeRetriever;
  generator: RuntimeGenerator;
  strategyModel: RuntimeStrategyModel;
  observer: RAGObserver;
}): Runtime {
  const { strategy, retriever, generator, strategyModel, observer } = options;
  const topK = strategy.retrieval.topK;
  const queryStrategies: QueryStrategy[] = [];

  if (strategy.preRetrieval.routing) {
    queryStrategies.push(
      createQueryRoutingStrategy({
        model: strategyModel,
        defaultRoute: 'vector',
      }),
    );
  }
  if (strategy.preRetrieval.rewrite) {
    queryStrategies.push(createQueryRewriteStrategy({ model: strategyModel }));
  }
  if (strategy.preRetrieval.expansion) {
    queryStrategies.push(createQueryExpansionStrategy({ model: strategyModel, count: 2 }));
  }
  if (strategy.preRetrieval.decomposition) {
    queryStrategies.push(createQueryDecompositionStrategy({ model: strategyModel, count: 2 }));
  }
  if (strategy.preRetrieval.multiQuery) {
    queryStrategies.push(createMultiQueryStrategy({ model: strategyModel, count: 2 }));
  }

  const postStrategies: PostRetrievalStrategy[] = [];
  if (strategy.postRetrieval.scoreThreshold) {
    postStrategies.push(
      createScoreThresholdStrategy({
        scoreThreshold: strategy.postRetrieval.scoreThresholdValue,
      }),
    );
  }
  if (strategy.postRetrieval.dedupe) {
    postStrategies.push(createNearDuplicateRemovalStrategy({ enabled: true }));
  }
  if (strategy.postRetrieval.contextBudget) {
    postStrategies.push(
      createBudgetTrimStrategy({
        budget: { maxCandidates: strategy.postRetrieval.contextBudgetMax },
      }),
    );
  }
  if (strategy.postRetrieval.sourceCoverage) {
    postStrategies.push(createSourceCoverageStrategy({ enabled: true }));
  }
  if (strategy.postRetrieval.rerank) {
    postStrategies.push(createLlmRerankStrategy({ model: strategyModel }));
  }
  if (strategy.postRetrieval.compression) {
    postStrategies.push(createContextCompressionStrategy({ model: strategyModel }));
  }
  if (strategy.postRetrieval.lostInMiddle) {
    postStrategies.push(createLostInTheMiddleStrategy());
  }

  const preprocessor: QueryPreprocessor = new StrategyQueryPreprocessor({
    base: {
      async preprocess(input, context) {
        const metaTopK =
          typeof input.metadata?.topK === 'number' && Number.isFinite(input.metadata.topK)
            ? input.metadata.topK
            : undefined;
        const resolvedTopK = metaTopK ?? topK;
        return new NoopQueryPreprocessor({
          topK: resolvedTopK,
          budget: {
            maxChunks: resolvedTopK,
            maxCandidates: strategy.postRetrieval.contextBudgetMax,
          },
        }).preprocess(input, context);
      },
    },
    strategies: queryStrategies,
  });

  return createDefaultRuntime({
    preprocessor,
    // 无 subQueries 时 FanOut 退化为单次检索，避免按开关再分两套 retriever
    retriever: new FanOutRetriever({ retriever }),
    postprocessor: new StrategyRetrievalPostprocessor({
      strategies: postStrategies,
    }),
    generator,
    observer,
  });
}

/** 控制台缺省「均衡」策略；与 web mock 默认开关对齐。 */
export function defaultStrategy(collectionId: string): StrategyConfig {
  return {
    collectionId,
    preset: 'balanced',
    preRetrieval: {
      rewrite: true,
      expansion: false,
      decomposition: false,
      multiQuery: false,
      routing: false,
    },
    retrieval: { topK: 8 },
    postRetrieval: {
      scoreThreshold: true,
      scoreThresholdValue: 0.2,
      dedupe: true,
      contextBudget: true,
      contextBudgetMax: 5,
      sourceCoverage: false,
      rerank: true,
      compression: true,
      lostInMiddle: false,
    },
    generation: {
      citations: true,
      activeRag: false,
      noGroundingPolicy: 'explicit',
    },
  };
}
