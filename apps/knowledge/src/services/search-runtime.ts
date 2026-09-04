import { randomUUID } from 'node:crypto';

import {
  FanOutRetriever,
  NoopQueryPreprocessor,
  createContextCompressionStrategy,
  createLlmRerankStrategy,
  createLlmRoutingStrategy,
  createMultiQueryStrategy,
  createQueryDecompositionStrategy,
  createQueryExpansionStrategy,
  createQueryRewriteStrategy,
  createRuntimeFromConfig,
  type QueryStrategy,
  type Runtime,
  type RuntimeSearchResult,
} from '@monai-ragsdk/runtime';

import type { StrategyConfig } from '../types.js';
import { getGlobalStrategy, resolveTargetCollections, type ConsoleCollectionRecord } from './console-state.js';
import { getRetrieverForCollection } from './retriever-pool.js';
import { getKnowledgeStack } from './stack.js';

/**
 * 把控制台 globalStrategy 编译进 createRuntimeFromConfig。
 * post 顺序走官方装配（rerank 在 threshold 前），不复用手拼 pipeline-factory。
 */
function compileStrategyRuntime(
  strategy: StrategyConfig,
  options: {
    retrieverInstance: Awaited<ReturnType<typeof buildRootRetriever>>['retriever'];
    routingTargets: string[];
  },
): Runtime {
  const { strategyModel, observer, searchOnlyGenerator } = getKnowledgeStack();
  const queryStrategies: QueryStrategy[] = [];

  if (strategy.preRetrieval.routing) {
    queryStrategies.push(
      createLlmRoutingStrategy({
        model: strategyModel,
        availableTargets: options.routingTargets,
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

  const topK = strategy.retrieval.topK;

  return createRuntimeFromConfig({
    retriever: options.retrieverInstance,
    fanOut: false,
    generator: searchOnlyGenerator,
    observer,
    query: {
      base: new NoopQueryPreprocessor({
        topK,
        budget: {
          maxChunks: topK,
          maxCandidates: strategy.postRetrieval.contextBudgetMax,
        },
      }),
      strategies: queryStrategies,
    },
    postRetrieval: {
      scoreThreshold: strategy.postRetrieval.scoreThreshold
        ? strategy.postRetrieval.scoreThresholdValue
        : undefined,
      applyRequestScoreThreshold: strategy.postRetrieval.scoreThreshold,
      budget: strategy.postRetrieval.contextBudget
        ? { maxCandidates: strategy.postRetrieval.contextBudgetMax }
        : undefined,
      applyRequestBudget: strategy.postRetrieval.contextBudget,
      nearDuplicateRemovalConfig: strategy.postRetrieval.dedupe ? { enabled: true } : undefined,
      sourceCoverageConfig: strategy.postRetrieval.sourceCoverage ? { enabled: true } : undefined,
      rerank: strategy.postRetrieval.rerank
        ? createLlmRerankStrategy({ model: strategyModel })
        : undefined,
      compression: strategy.postRetrieval.compression
        ? createContextCompressionStrategy({ model: strategyModel })
        : undefined,
      lostInTheMiddle: strategy.postRetrieval.lostInMiddle,
    },
  });
}

async function buildRootRetriever(targets: ConsoleCollectionRecord[]): Promise<{
  retriever: FanOutRetriever;
}> {
  const retrievers = [];
  for (const record of targets) {
    retrievers.push(await getRetrieverForCollection(record.id));
  }

  if (retrievers.length === 1) {
    return {
      retriever: new FanOutRetriever({ retriever: retrievers[0]! }),
    };
  }

  return {
    retriever: new FanOutRetriever({
      retriever: retrievers[0]!,
      retrievers,
    }),
  };
}

async function buildSearchRuntime(collectionIds?: string[]): Promise<{
  runtime: Runtime;
  targets: ConsoleCollectionRecord[];
  strategy: StrategyConfig;
}> {
  const targets = resolveTargetCollections(collectionIds);
  const strategy = getGlobalStrategy();
  const { retriever } = await buildRootRetriever(targets);

  const runtime = compileStrategyRuntime(strategy, {
    retrieverInstance: retriever,
    routingTargets: targets.map((item) => item.id),
  });

  return { runtime, targets, strategy };
}

export async function searchKnowledge(
  query: string,
  topK: number | undefined,
  collectionIds?: string[],
): Promise<{
  result: RuntimeSearchResult;
  targets: ConsoleCollectionRecord[];
  resolvedTopK: number;
}> {
  const { runtime, targets, strategy } = await buildSearchRuntime(collectionIds);
  const resolvedTopK =
    typeof topK === 'number' && Number.isInteger(topK) && topK > 0 ? topK : strategy.retrieval.topK;
  const scope = targets.length === 1 ? targets[0]! : null;

  const result = await runtime.search(
    { query, metadata: { topK: resolvedTopK } },
    {
      requestId: randomUUID(),
      trace: {
        tags: {
          collectionId: scope?.id ?? 'global',
          collectionName: scope?.name ?? `${targets.length} 个知识库`,
          collectionIds: targets.map((item) => item.id).join(','),
        },
      },
    },
  );

  return { result, targets, resolvedTopK };
}
