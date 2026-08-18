import type { RAGTrace } from '../types/rag-trace.js';
import type { TraceExporter } from './trace-exporter.js';

export interface MemoryTraceExporter extends TraceExporter {
  getTraces(): RAGTrace[];
  clear(): void;
}

export function createMemoryTraceExporter(): MemoryTraceExporter {
  const traces: RAGTrace[] = [];

  return {
    async export(trace) {
      traces.push(trace);
    },

    getTraces() {
      return [...traces];
    },

    clear() {
      traces.length = 0;
    },

    async flush() {},

    async shutdown() {},
  };
}
