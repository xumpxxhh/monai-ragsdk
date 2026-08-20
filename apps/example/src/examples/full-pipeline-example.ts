import { PgVectorRuntimeRetrieverAdapter } from '@monai-ragsdk/adapters';
import {
  FanOutRetriever,
  StrategyQueryPreprocessor,
  createDefaultRuntime,
  createLlmRoutingStrategy,
  createQueryRewriteStrategy,
} from '@monai-ragsdk/runtime';

import { createExampleObserver } from '../shared/create-example-observer.js';
import { createExampleStack, type ExampleStack } from '../shared/create-example-stack.js';
import { embedQuery } from '../shared/embed-query.js';
import { loadExampleConfig } from '../shared/example-config.js';
import { indexExampleAssets } from '../shared/index-assets.js';
import { streamRuntime } from '../shared/stream-runtime.js';
import { writeExampleOutput } from '../shared/write-example-output.js';

export const EXAMPLE_ID = 'full-pipeline';

export const EXAMPLE_DESCRIPTION =
  'Query Routing：LLM 产出 routeDecision（targets / searchType），FanOut 按 targets 选 retriever，pgvector 按 searchType 切换召回。';

/** 演示用查询：偏概念/关系型，便于 LLM 选语义 retriever + vector 召回。 */
export const ROUTING_DEMO_QUERY =
  'pgvector 是什么？它和 PostgreSQL 是什么关系？请用语义相近的方式检索说明。';

const ROUTING_TARGETS = ['pgvector-semantic', 'pgvector-keyword'] as const;

/**
 * 两个 retriever 共用同一张表，仅 id 不同，供 FanOut 按 routeDecision.targets 过滤。
 * searchType 仍由 request.routeDecision 下传，决定各自跑 vector / keyword / hybrid SQL。
 */
function createRoutingRetrievers(stack: ExampleStack): PgVectorRuntimeRetrieverAdapter[] {
  const shared = {
    connectionString: stack.config.connectionString,
    tableName: stack.config.tableName,
    embedQuery: async (query: string) => embedQuery(stack.embedder, query),
  };

  return [
    new PgVectorRuntimeRetrieverAdapter({ ...shared, id: 'pgvector-semantic' }),
    new PgVectorRuntimeRetrieverAdapter({ ...shared, id: 'pgvector-keyword' }),
  ];
}

function logRoutingOutcome(result: Awaited<ReturnType<typeof streamRuntime>>): void {
  const metadata = result.retrievalMetadata;
  console.log('routing outcome:', {
    provider: metadata?.provider,
    searchType: metadata?.searchType,
    skipped: metadata?.skipped,
    skipReason: metadata?.skipReason,
    retrieverCount: metadata?.retrieverCount,
    vectorCandidateCount: metadata?.vectorCandidateCount,
    keywordCandidateCount: metadata?.keywordCandidateCount,
  });
}

/**
 * 只保留 query-routing + FanOut，后处理走默认链，便于对照 trace 里的 routeDecision 与 retrieval 事件。
 */
export async function runFullPipelineExample(): Promise<void> {
  const config = loadExampleConfig({ query: ROUTING_DEMO_QUERY });
  const stack = createExampleStack(config);
  const routingRetrievers = createRoutingRetrievers(stack);
  const exampleObserver = createExampleObserver(EXAMPLE_ID);

  try {
    const indexing = await indexExampleAssets(stack);
    const sourceRecords = await stack.store.listSourceRecords();
    const runtime = createDefaultRuntime({
      preprocessor: new StrategyQueryPreprocessor({
        strategies: [
          createQueryRewriteStrategy({
            model: stack.strategyModel,
          }),
          createLlmRoutingStrategy({
            model: stack.strategyModel,
            availableTargets: [...ROUTING_TARGETS],
          }),
        ],
      }),
      retriever: new FanOutRetriever({
        retriever: routingRetrievers[0]!,
        retrievers: routingRetrievers,
      }),
      generator: stack.generator,
      observer: exampleObserver.observer,
    });
    const result = await streamRuntime({
      runtime,
      query: config.query,
    });

    logRoutingOutcome(result);
    console.log(`${EXAMPLE_ID} example passed`);
    const outputPath = await writeExampleOutput({
      exampleId: EXAMPLE_ID,
      description: EXAMPLE_DESCRIPTION,
      config,
      indexing,
      sourceRecordCount: sourceRecords.length,
      query: config.query,
      result,
      traceFilePath: exampleObserver.traceFilePath,
    });
    console.log(outputPath);
    console.log(exampleObserver.traceFilePath);
  } finally {
    await Promise.all(routingRetrievers.map((retriever) => retriever.close()));
    await exampleObserver.shutdown();
    await stack.close();
  }
}
