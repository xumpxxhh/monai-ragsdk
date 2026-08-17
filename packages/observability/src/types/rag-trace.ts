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
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "ok" | "error";
  tags?: RAGTags;
  events: RAGEvent[];
  errors?: RAGErrorRecord[];
  metrics?: RAGMetric[];
}
