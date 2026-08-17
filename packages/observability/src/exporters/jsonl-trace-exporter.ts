import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { RAGTrace } from "../types/rag-trace.js";
import type { TraceExporter } from "./trace-exporter.js";

export interface JsonlTraceExporterOptions {
  filePath: string;
  append?: boolean;
  encoding?: BufferEncoding;
}

export interface JsonlTraceExporter extends TraceExporter {
  readonly filePath: string;
}

export function createJsonlTraceExporter(
  options: JsonlTraceExporterOptions,
): JsonlTraceExporter {
  const encoding = options.encoding ?? "utf-8";
  const appendMode = options.append ?? true;
  let isInitialized = false;
  let isShutdown = false;
  let queue = Promise.resolve();

  async function ensureWritableFile(): Promise<void> {
    if (isInitialized) {
      return;
    }

    await mkdir(dirname(options.filePath), { recursive: true });

    if (appendMode) {
      await appendFile(options.filePath, "", { encoding });
    } else {
      await writeFile(options.filePath, "", { encoding });
    }

    isInitialized = true;
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.then(
      () => undefined,
      () => undefined,
    );

    return next;
  }

  return {
    filePath: options.filePath,

    async export(trace: RAGTrace) {
      return enqueue(async () => {
        if (isShutdown) {
          throw new Error("JSONL trace exporter has been shut down");
        }

        await ensureWritableFile();
        await appendFile(options.filePath, `${JSON.stringify(trace)}\n`, {
          encoding,
        });
      });
    },

    async flush() {
      await queue;
    },

    async shutdown() {
      await queue;
      isShutdown = true;
    },
  };
}
