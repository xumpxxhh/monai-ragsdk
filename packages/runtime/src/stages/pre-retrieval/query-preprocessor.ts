import type { RetrievalRequest, RuntimeContext, RuntimeQueryInput } from '../../types/index.js';

export interface QueryPreprocessor {
  preprocess(input: RuntimeQueryInput, context: RuntimeContext): Promise<RetrievalRequest>;
}
