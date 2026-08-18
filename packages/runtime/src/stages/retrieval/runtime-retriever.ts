import type {
  RetrievalRequest,
  RuntimeContext,
  RuntimeRetrievalResult,
} from '../../types/index.js';

export interface RuntimeRetriever {
  retrieve(request: RetrievalRequest, context: RuntimeContext): Promise<RuntimeRetrievalResult>;
}
