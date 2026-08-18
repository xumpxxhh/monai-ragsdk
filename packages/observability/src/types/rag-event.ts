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
  /** Unix 毫秒时间戳；JSONL / observer 流通用 number，控制台展示时再转 ISO。 */
  timestamp: number;
  durationMs?: number;
  attributes?: RAGAttributes;
}
