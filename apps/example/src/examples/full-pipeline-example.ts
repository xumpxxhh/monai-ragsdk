import {
  FanOutRetriever,
  StrategyQueryPreprocessor,
  StrategyRetrievalPostprocessor,
  createContextCompressionStrategy,
  createDefaultRuntime,
  createLlmRerankStrategy,
  createMultiQueryStrategy,
} from '@monai-ragsdk/runtime';

import { createExampleObserver } from '../shared/create-example-observer.js';
import { createExampleStack } from '../shared/create-example-stack.js';
import { loadExampleConfig } from '../shared/example-config.js';
import { indexExampleAssets } from '../shared/index-assets.js';
import { streamRuntime } from '../shared/stream-runtime.js';
import { writeExampleOutput } from '../shared/write-example-output.js';

export const EXAMPLE_ID = 'full-pipeline';

export const EXAMPLE_DESCRIPTION =
  '完整策略 pipeline：Routing → Rewrite → Multi-Query → FanOut → Rerank → Compression → 流式生成。';

/**
 * 串联 pre / post 策略与 FanOut；推荐顺序与 runtime demo 一致，便于对照 SDK 能力边界。
 */
export async function runFullPipelineExample(): Promise<void> {
  const config = loadExampleConfig();
  const stack = createExampleStack(config);
  const exampleObserver = createExampleObserver(EXAMPLE_ID);

  try {
    const indexing = await indexExampleAssets(stack);
    const sourceRecords = await stack.store.listSourceRecords();
    const runtime = createDefaultRuntime({
      preprocessor: new StrategyQueryPreprocessor({
        strategies: [
          // createQueryRoutingStrategy({
          //   model: stack.strategyModel,
          //   defaultRoute: "vector",
          // }),
          // createQueryRewriteStrategy({ model: stack.strategyModel }),
          createMultiQueryStrategy({
            model: stack.strategyModel,
            count: 2,
          }),
        ],
      }),
      retriever: new FanOutRetriever({
        retriever: stack.retriever,
      }),
      postprocessor: new StrategyRetrievalPostprocessor({
        strategies: [
          createLlmRerankStrategy({ model: stack.strategyModel }),
          createContextCompressionStrategy({ model: stack.strategyModel }),
        ],
      }),
      generator: stack.generator,
      observer: exampleObserver.observer,
    });
    const result = await streamRuntime({
      runtime,
      query: config.query,
    });

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
    await exampleObserver.shutdown();
    await stack.close();
  }
}
