import {
  StrategyRetrievalPostprocessor,
  createContextCompressionStrategy,
  createDefaultRuntime,
  createLlmRerankStrategy,
  createLostInTheMiddleStrategy,
} from '@monai-ragsdk/runtime';

import { createExampleObserver } from '../shared/create-example-observer.js';
import { createExampleStack } from '../shared/create-example-stack.js';
import { loadExampleConfig } from '../shared/example-config.js';
import { indexExampleAssets } from '../shared/index-assets.js';
import { streamRuntime } from '../shared/stream-runtime.js';
import { writeExampleOutput } from '../shared/write-example-output.js';

export const EXAMPLE_ID = 'post-retrieval';

export const EXAMPLE_DESCRIPTION =
  'Post-retrieval 策略链：LLM Rerank → Context Compression → Lost-in-the-Middle → 流式生成。';

/**
 * 演示检索后重排、上下文压缩与位置偏置重排；pre-retrieval 保持默认 noop。
 */
export async function runPostRetrievalExample(): Promise<void> {
  const config = loadExampleConfig();
  const stack = createExampleStack(config);
  const exampleObserver = createExampleObserver(EXAMPLE_ID);

  try {
    const indexing = await indexExampleAssets(stack);
    const sourceRecords = await stack.store.listSourceRecords();
    const runtime = createDefaultRuntime({
      retriever: stack.retriever,
      postprocessor: new StrategyRetrievalPostprocessor({
        strategies: [
          createLlmRerankStrategy({ model: stack.strategyModel }),
          createContextCompressionStrategy({ model: stack.strategyModel }),
          createLostInTheMiddleStrategy(),
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
