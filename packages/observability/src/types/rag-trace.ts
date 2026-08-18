import type { RAGErrorRecord } from "./rag-error-record.js";
import type { RAGEvent, RAGEventScope } from "./rag-event.js";
import type { RAGMetric } from "./rag-metric.js";
import type { RAGTags } from "./rag-attributes.js";
import type { TraceIdSource } from "./trace-context.js";

export interface RAGTrace {
  traceId: string;
  traceIdSource?: TraceIdSource;
  requestId?: string;
  scope: RAGEventScope;
  serviceName?: string;
  environment?: string;
  sampleId?: string;
  dataset?: string;
  version?: string;
  /** Unix 毫秒时间戳；存储与流通用 number，展示层再转 ISO。 */
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: "ok" | "error";
  tags?: RAGTags;
  events: RAGEvent[];
  errors?: RAGErrorRecord[];
  metrics?: RAGMetric[];
}
