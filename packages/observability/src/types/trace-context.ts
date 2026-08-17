import type { RAGTags } from "./rag-attributes.js";

export type TraceIdSource = "generated" | "provided" | "requestId";

export interface TraceContext {
  traceId: string;
  traceIdSource?: TraceIdSource;
  requestId?: string;
  serviceName?: string;
  environment?: string;
  sampleId?: string;
  dataset?: string;
  version?: string;
  tags?: RAGTags;
}
