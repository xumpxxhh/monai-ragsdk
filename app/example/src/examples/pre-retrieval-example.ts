import {
  FanOutRetriever,
  StrategyQueryPreprocessor,
  createDefaultRuntime,
  createMultiQueryStrategy,
  createQueryRewriteStrategy,
} from "@monai-ragsdk/runtime";

import { createExampleObserver } from "../shared/create-example-observer.js";
import { createExampleStack } from "../shared/create-example-stack.js";
import { loadExampleConfig } from "../shared/example-config.js";
import { indexExampleAssets } from "../shared/index-assets.js";
import { streamRuntime } from "../shared/stream-runtime.js";
import { writeExampleOutput } from "../shared/write-example-output.js";

export const EXAMPLE_ID = "pre-retrieval";

export const EXAMPLE_DESCRIPTION =
  "Pre-retrieval 策略链：Query Rewrite → Multi-Query → FanOut 检索 → 默认后处理 → 流式生成。";

/**
 * 演示 LLM 改写与多路子查询；subQueries 存在时 FanOutRetriever 并发检索并用 RRF 融合。
 */
export async function runPreRetrievalExample(): Promise<void> {
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
