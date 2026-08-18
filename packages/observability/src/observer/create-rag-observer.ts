import type { TraceExporter } from '../exporters/trace-exporter.js';
import type { RAGErrorRecord } from '../types/rag-error-record.js';
import type { RAGEvent } from '../types/rag-event.js';
import type { RAGTrace } from '../types/rag-trace.js';
import type { RAGTags } from '../types/rag-attributes.js';
import { invokeObserverSafely } from '../utils/index.js';
import type { RAGObserver } from './rag-observer.js';

type TraceBuffer = {
  events: RAGEvent[];
  errors: RAGErrorRecord[];
};

export interface CreateRAGObserverOptions {
  serviceName?: string;
  environment?: string;
  exporters?: TraceExporter[];
  defaultTags?: RAGTags;
}

function mergeTags(
  defaultTags: RAGTags | undefined,
  traceTags: RAGTags | undefined,
): RAGTags | undefined {
  if (!defaultTags && !traceTags) {
    return undefined;
  }

  return {
    ...(defaultTags ?? {}),
    ...(traceTags ?? {}),
  };
}

async function exportTrace(exporters: TraceExporter[], trace: RAGTrace): Promise<void> {
  await Promise.all(
    exporters.map((exporter) => invokeObserverSafely(() => exporter.export(trace))),
  );
}

async function runExporterLifecycle(
  exporters: TraceExporter[],
  method: 'flush' | 'shutdown',
): Promise<void> {
  const results = await Promise.allSettled(exporters.map((exporter) => exporter[method]?.()));
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (failures.length === 0) {
    return;
  }

  throw failures[0].reason;
}

export function createRAGObserver(options: CreateRAGObserverOptions = {}): RAGObserver {
  const exporters = options.exporters ?? [];
  const buffers = new Map<string, TraceBuffer>();

  function getBuffer(traceId: string): TraceBuffer {
    const existing = buffers.get(traceId);

    if (existing) {
      return existing;
    }

    const created: TraceBuffer = {
      events: [],
      errors: [],
    };
    buffers.set(traceId, created);

    return created;
  }

  return {
    async onEvent(event) {
      getBuffer(event.traceId).events.push(event);
    },

    async onError(error) {
      getBuffer(error.traceId).errors.push(error);
    },

    async onTraceEnd(trace) {
      const buffer = buffers.get(trace.traceId);
      buffers.delete(trace.traceId);

      const normalizedTrace: RAGTrace = {
        ...trace,
        ...(options.serviceName && !trace.serviceName ? { serviceName: options.serviceName } : {}),
        ...(options.environment && !trace.environment ? { environment: options.environment } : {}),
        ...(mergeTags(options.defaultTags, trace.tags)
          ? { tags: mergeTags(options.defaultTags, trace.tags) }
          : {}),
        events: trace.events.length > 0 ? trace.events : (buffer?.events ?? []),
        ...(trace.errors || (buffer?.errors.length ?? 0) > 0
          ? { errors: trace.errors ?? buffer?.errors ?? [] }
          : {}),
      };

      await exportTrace(exporters, normalizedTrace);
    },

    async flush() {
      await runExporterLifecycle(exporters, 'flush');
    },

    async shutdown() {
      await runExporterLifecycle(exporters, 'shutdown');
    },
  };
}
