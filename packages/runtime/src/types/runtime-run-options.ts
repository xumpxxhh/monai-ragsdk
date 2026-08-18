import type { RAGTags } from '@monai-ragsdk/observability';

export type RuntimeTraceOptions = {
  traceId?: string;
  tags?: RAGTags;
};

export type RuntimeRunOptions = {
  includeDebug?: boolean;
  requestId?: string;
  trace?: RuntimeTraceOptions;
};
