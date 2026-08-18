import { readIndexSnapshot, writeIndexSnapshot } from "../../rag/indexing/snapshot.js";
import { runLocalIndexing } from "../../rag/indexing/workflow.js";
import { createCliObserver } from "../../rag/observer.js";
import { loadCliConfig } from "../../config/loader.js";
import { printIndexSummary } from "../../rag/runtime/output.js";
import type { IndexCommandOptions } from "../../types.js";

export async function runIndexCommand(
  options: IndexCommandOptions,
): Promise<void> {
  const { config } = await loadCliConfig(options.configFilePath);
  const { observer, resolvedTraceFilePath } = await createCliObserver(
    options.traceFilePath,
  );

  try {
    const previousSnapshot = await readPreviousSnapshot(options.indexFilePath);
    const snapshot = await runLocalIndexing({
      options,
      config,
      observer,
      command: "index",
      previousChunks: previousSnapshot?.chunks,
      previousVectors: previousSnapshot?.vectors,
    });
    const resolvedIndexFilePath = await writeIndexSnapshot(
      options.indexFilePath,
      snapshot,
    );

    printIndexSummary({
      indexingResult: snapshot.indexingResult,
      directoryPath: snapshot.directoryPath,
      indexFilePath: resolvedIndexFilePath,
      traceFilePath: resolvedTraceFilePath,
    });
  } finally {
    await observer.shutdown?.();
  }
}

async function readPreviousSnapshot(indexFilePath: string) {
  try {
    const { snapshot } = await readIndexSnapshot(indexFilePath);
    return snapshot;
  } catch {
    return undefined;
  }
}
