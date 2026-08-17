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
  timestamp: string;
  error: RAGErrorSummary;
  attributes?: RAGAttributes;
}
