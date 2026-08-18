import { createDefaultRuntime } from "@monai-ragsdk/runtime";

import { createExampleObserver } from "../shared/create-example-observer.js";
import { createExampleStack } from "../shared/create-example-stack.js";
import { loadExampleConfig } from "../shared/example-config.js";
import { indexExampleAssets } from "../shared/index-assets.js";
import { streamRuntime } from "../shared/stream-runtime.js";
import { writeExampleOutput } from "../shared/write-example-output.js";

export const EXAMPLE_ID = "basic-stream";

export const EXAMPLE_DESCRIPTION =
  "默认栈闭环：markdown 增量索引 → pgvector 检索 → OpenAI 兼容流式生成（无策略链）。";

/**
 * 基础流式示例：embedding 读 EMBEDDING_API_KEY，chat 读 OPENAI_API_KEY。
 */
export async function runBasicStreamExample(): Promise<void> {
  const config = loadExampleConfig();
  const stack = createExampleStack(config);
  const exampleObserver = createExampleObserver(EXAMPLE_ID);

  try {
    const indexing = await indexExampleAssets(stack);
    const sourceRecords = await stack.store.listSourceRecords();
    const runtime = createDefaultRuntime({
      retriever: stack.retriever,
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
