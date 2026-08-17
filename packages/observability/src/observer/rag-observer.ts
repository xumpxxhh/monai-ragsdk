import type { RAGErrorRecord } from "../types/rag-error-record.js";
import type { RAGEvent } from "../types/rag-event.js";
import type { RAGTrace } from "../types/rag-trace.js";

export interface RAGObserver {
  onEvent?(event: RAGEvent): void | Promise<void>;
  onError?(error: RAGErrorRecord): void | Promise<void>;
  onTraceEnd?(trace: RAGTrace): void | Promise<void>;
  flush?(): void | Promise<void>;
  shutdown?(): void | Promise<void>;
}
