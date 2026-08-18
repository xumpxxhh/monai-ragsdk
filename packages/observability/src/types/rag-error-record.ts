import type { RAGAttributes } from "./rag-attributes.js";
import type { RAGEventName, RAGEventScope } from "./rag-event.js";

export interface RAGErrorSummary {
  name: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface RAGErrorRecord {
  traceId: string;
  scope: RAGEventScope;
  stage: string;
  name: RAGEventName;
  /** Unix 毫秒时间戳；与 RAGEvent.timestamp 同一口径。 */
  timestamp: number;
  error: RAGErrorSummary;
  attributes?: RAGAttributes;
}
