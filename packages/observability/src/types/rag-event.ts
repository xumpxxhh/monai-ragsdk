import type { RAGAttributes } from "./rag-attributes.js";

export type RAGEventScope = "runtime" | "indexing";

export type RAGEventAction =
  | "receive"
  | "preprocess"
  | "start"
  | "complete"
  | "fail"
  | "select"
  | "drop"
  | "store";

export type RAGEventName =
  | `runtime.${string}.${RAGEventAction}`
  | `indexing.${string}.${RAGEventAction}`;

export interface RAGEvent {
  traceId: string;
  scope: RAGEventScope;
  stage: string;
  name: RAGEventName;
  timestamp: string;
  durationMs?: number;
  attributes?: RAGAttributes;
}
