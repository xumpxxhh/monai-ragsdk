import type { RAGAttributes } from './rag-attributes.js';
import type { RAGEventScope } from './rag-event.js';

export type RAGMetricUnit = 'ms' | 'count' | 'tokens' | 'ratio' | 'bytes';

export interface RAGMetric {
  traceId: string;
  name: string;
  value: number;
  unit?: RAGMetricUnit;
  scope?: RAGEventScope;
  stage?: string;
  attributes?: RAGAttributes;
}
