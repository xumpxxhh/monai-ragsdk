import type { RAGTrace } from '../types/rag-trace.js';

export interface TraceExporter {
  export(trace: RAGTrace): void | Promise<void>;
  flush?(): void | Promise<void>;
  shutdown?(): void | Promise<void>;
}
