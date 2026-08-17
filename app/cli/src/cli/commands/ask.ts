import { createCliObserver } from "../../rag/observer.js";
import { loadCliConfig } from "../../config/loader.js";
import { printAskSummary } from "../../rag/runtime/output.js";
import { runLocalIndexing } from "../../rag/indexing/workflow.js";
import {
  runRuntimeFromConfiguredStore,
  runRuntimeFromSnapshot,
} from "../../rag/runtime/workflow.js";
import type { AskCommandOptions } from "../../types.js";

export async function runAskCommand(options: AskCommandOptions): Promise<void> {
  const { config } = await loadCliConfig(options.configFilePath);
  const { observer, resolvedTraceFilePath } = await createCliObserver(
    options.traceFilePath,
  );

  try {
    const snapshot = await runLocalIndexing({
      options,
      config,
      observer,
      command: "ask",
    });
    const runtimeResult =
      config.vectorStore.provider === "pgvector"
        ? await runRuntimeFromConfiguredStore({
            config,
            query: options.query,
            topK: options.topK,
            debug: options.debug,
            observer,
            command: "ask",
          })
        : await runRuntimeFromSnapshot({
            snapshot,
            query: options.query,
            topK: options.topK,
            debug: options.debug,
            observer,
            command: "ask",
          });

    printAskSummary({
      debug: options.debug,
      indexingResult: snapshot.indexingResult,
      runtimeResult,
      traceFilePath: resolvedTraceFilePath,
    });
  } finally {
    await observer.shutdown?.();
  }
}
