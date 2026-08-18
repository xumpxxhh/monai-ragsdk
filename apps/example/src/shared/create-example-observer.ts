import type { RAGObserver } from '@monai-ragsdk/observability';
import {
  createConsoleObserver,
  createJsonlTraceExporter,
  createRAGObserver,
} from '@monai-ragsdk/observability';

import { buildTraceOutputPath } from './paths.js';

export type ExampleObserverHandle = {
  observer: RAGObserver;
  traceFilePath: string;
  shutdown: () => Promise<void>;
};

/** 把多个 observer 合并为一个；各回调并行触发，互不阻塞主链路。 */
function mergeObservers(observers: RAGObserver[]): RAGObserver {
  return {
    async onEvent(event) {
      await Promise.all(observers.map((item) => item.onEvent?.(event)).filter(Boolean));
    },
    async onError(error) {
      await Promise.all(observers.map((item) => item.onError?.(error)).filter(Boolean));
    },
    async onTraceEnd(trace) {
      await Promise.all(observers.map((item) => item.onTraceEnd?.(trace)).filter(Boolean));
    },
    async flush() {
      await Promise.all(observers.map((item) => item.flush?.()).filter(Boolean));
    },
    async shutdown() {
      await Promise.all(observers.map((item) => item.shutdown?.()).filter(Boolean));
    },
  };
}

/**
 * 为示例创建 observability 栈：控制台 debug 事件 + JSONL trace 落盘。
 * runtime 传入返回的 observer 后，各阶段事件会写入 trace 文件。
 */
export function createExampleObserver(exampleId: string): ExampleObserverHandle {
  const traceFilePath = buildTraceOutputPath(exampleId);

  const consoleObserver = createConsoleObserver({
    level: 'debug',
    includeAttributes: true,
  });

  const jsonlObserver = createRAGObserver({
    serviceName: 'monai-ragsdk-example',
    environment: 'local-example',
    exporters: [
      createJsonlTraceExporter({
        filePath: traceFilePath,
        append: false,
      }),
    ],
    defaultTags: {
      exampleId,
    },
  });

  const observer = mergeObservers([consoleObserver, jsonlObserver]);

  return {
    observer,
    traceFilePath,
    async shutdown() {
      await observer.shutdown?.();
    },
  };
}
