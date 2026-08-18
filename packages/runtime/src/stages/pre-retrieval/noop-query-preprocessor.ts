import type { QueryPreprocessor } from './query-preprocessor.js';
import type {
  RetrievalBudget,
  RetrievalFilters,
  RetrievalRerankPolicy,
  RetrievalRequest,
  RuntimeContext,
  RuntimeQueryInput,
} from '../../types/index.js';

export type NoopQueryPreprocessorOptions = {
  topK?: number;
  strategy?: string;
  route?: string;
  indexingMode?: 'full' | 'incremental';
  filters?: RetrievalFilters;
  budget?: RetrievalBudget;
  rerank?: RetrievalRerankPolicy;
};

export class NoopQueryPreprocessor implements QueryPreprocessor {
  constructor(private readonly options: NoopQueryPreprocessorOptions = {}) {}

  async preprocess(input: RuntimeQueryInput, _context: RuntimeContext): Promise<RetrievalRequest> {
    const query = { query: input.query };

    return {
      originalQuery: query,
      effectiveQuery: query,
      topK: this.options.topK,
      filters: this.options.filters,
      strategy: this.options.strategy,
      route: this.options.route,
      indexingMode: this.options.indexingMode,
      budget: this.options.budget,
      rerank: this.options.rerank,
      metadata: input.metadata,
    };
  }
}
