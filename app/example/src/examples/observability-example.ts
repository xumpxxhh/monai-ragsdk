import {
  FanOutRetriever,
  StrategyQueryPreprocessor,
  StrategyRetrievalPostprocessor,
  createContextCompressionStrategy,
  createDefaultRuntime,
  createLlmRerankStrategy,
  createLostInTheMiddleStrategy,
  createMultiQueryStrategy,
  createQueryRewriteStrategy,
} from "@monai-ragsdk/runtime";

import { createExampleObserver } from "../shared/create-example-observer.js";
import { createExampleStack } from "../shared/create-example-stack.js";
import { loadExampleConfig } from "../shared/example-config.js";
import { indexExampleAssets } from "../shared/index-assets.js";
import { streamRuntime } from "../shared/stream-runtime.js";
import { writeExampleOutput } from "../shared/write-example-output.js";

export const EXAMPLE_ID = "observability";

export const EXAMPLE_DESCRIPTION =
  "Observability 对照示例：前后策略 + FanOut，重点查看 trace 事件链路。";

/**
 * 与 pre/post 策略组合相近，保留独立 id 便于单独对照 trace 文件。
 */
export async function runObservabilityExample(): Promise<void> {
  const config = loadExampleConfig();
  const stack = createExampleStack(config);
  const exampleObserver = createExampleObserver(EXAMPLE_ID);

  try {
    const indexing = await indexExampleAssets(stack);
    const sourceRecords = await stack.store.listSourceRecords();
    const runtime = createDefaultRuntime({
      preprocessor: new StrategyQueryPreprocessor({
        strategies: [
          createQueryRewriteStrategy({ model: stack.strategyModel }),
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
