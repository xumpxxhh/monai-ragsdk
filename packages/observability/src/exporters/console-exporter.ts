import type { TraceExporter } from './trace-exporter.js';
import {
  formatTrace,
  shouldLog,
  writeConsole,
  type ConsoleOutputOptions,
  type ConsoleObserverLevel,
} from '../formatters/index.js';
import type { RAGTrace } from '../types/rag-trace.js';

export interface ConsoleExporterOptions extends ConsoleOutputOptions {}

export function createConsoleExporter(options: ConsoleExporterOptions = {}): TraceExporter {
  const configuredLevel = options.level ?? 'info';

  return {
    async export(trace: RAGTrace) {
      const traceLevel: ConsoleObserverLevel = trace.status === 'error' ? 'error' : 'info';

      if (!shouldLog(configuredLevel, traceLevel)) {
        return;
      }

      writeConsole(traceLevel, formatTrace(trace));
    },

    async flush() {},

    async shutdown() {},
  };
}
