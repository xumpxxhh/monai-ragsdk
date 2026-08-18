import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  createJsonlTraceExporter,
  createRAGObserver,
  type RAGObserver,
} from '@monai-ragsdk/observability';

export async function createCliObserver(traceFilePath: string): Promise<{
  observer: RAGObserver;
  resolvedTraceFilePath: string;
}> {
  const resolvedTraceFilePath = path.resolve(process.cwd(), traceFilePath);

  await mkdir(path.dirname(resolvedTraceFilePath), { recursive: true });

  return {
    observer: createRAGObserver({
      serviceName: 'monai-ragsdk-cli',
      environment: 'local-cli',
      exporters: [
        createJsonlTraceExporter({
          filePath: resolvedTraceFilePath,
          append: false,
        }),
      ],
    }),
    resolvedTraceFilePath,
  };
}
