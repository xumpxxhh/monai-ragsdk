import { readIndexSnapshot } from "../../rag/indexing/snapshot.js";
import { createCliObserver } from "../../rag/observer.js";
import { loadCliConfig } from "../../config/loader.js";
import {
  printRuntimeAnswerSummary,
  printRuntimeRetrievalSummary,
} from "../../rag/runtime/output.js";
import {
  runRetrievalFromConfiguredStore,
  runRetrievalFromSnapshot,
  runRuntimeFromConfiguredStore,
  runRuntimeFromSnapshot,
} from "../../rag/runtime/workflow.js";
import type { RuntimeCommandOptions } from "../../types.js";

export async function runRuntimeCommand(
  options: RuntimeCommandOptions,
): Promise<void> {
  const { config } = await loadCliConfig(options.configFilePath);
  const { observer, resolvedTraceFilePath } = await createCliObserver(
    options.traceFilePath,
  );

  try {
    if (options.subcommand === "retrieval") {
      const retrievalResult =
        config.vectorStore.provider === "pgvector"
          ? await runRetrievalFromConfiguredStore({
              config,
              query: options.query,
              topK: options.topK,
            })
          : await runRetrievalFromSnapshot({
              ...(await readIndexSnapshot(options.indexFilePath)),
              query: options.query,
              topK: options.topK,
            });

      printRuntimeRetrievalSummary({
        retrievalResult,
        indexSource: readIndexSource(config, options.indexFilePath),
        traceFilePath: resolvedTraceFilePath,
        debug: options.debug,
      });

      return;
    }

    const runtimeResult =
      config.vectorStore.provider === "pgvector"
        ? await runRuntimeFromConfiguredStore({
            config,
            query: options.query,
            topK: options.topK,
            debug: options.debug,
            observer,
            command: "runtime",
          })
        : await runRuntimeFromSnapshot({
            snapshot: (await readIndexSnapshot(options.indexFilePath)).snapshot,
            query: options.query,
            topK: options.topK,
            debug: options.debug,
            observer,
            command: "runtime",
          });

    printRuntimeAnswerSummary({
      runtimeResult,
      indexSource: readIndexSource(config, options.indexFilePath),
      traceFilePath: resolvedTraceFilePath,
      debug: options.debug,
    });
  } finally {
    await observer.shutdown?.();
  }
}

function readIndexSource(
  config: Awaited<ReturnType<typeof loadCliConfig>>["config"],
  indexFilePath: string,
): string {
  if (config.vectorStore.provider === "pgvector") {
    return `pgvector:${config.vectorStore.schema}.${config.vectorStore.tableName}`;
  }

  return indexFilePath;
}
