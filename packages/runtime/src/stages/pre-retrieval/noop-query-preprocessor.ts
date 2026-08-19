import type { QueryPreprocessor } from './query-preprocessor.js';
import type {
  RetrievalBudget,
  RetrievalFilters,
  RetrievalRerankPolicy,
  RetrievalRequest,
  RuntimeContext,
  RuntimeQueryInput,
} from '../../types/index.js';
import { applyRetrievalTopKAlias } from '../retrieval/apply-retrieval-top-k-alias.js';

export type NoopQueryPreprocessorOptions = {
  /** 历史别名；未设 `budget.maxChunks` 时补齐权威条数。 */
  topK?: number;
  /** debug-only，见 RetrievalRequest.strategy。 */
  strategy?: string;
  /** debug-only，见 RetrievalRequest.route。 */
  route?: string;
  /** query-time unused，仅透传到 request。 */
  indexingMode?: 'full' | 'incremental';
  filters?: RetrievalFilters;
  budget?: RetrievalBudget;
  rerank?: RetrievalRerankPolicy;
};

export class NoopQueryPreprocessor implements QueryPreprocessor {
  constructor(private readonly options: NoopQueryPreprocessorOptions = {}) {}

  async preprocess(input: RuntimeQueryInput, _context: RuntimeContext): Promise<RetrievalRequest> {
    const query = { query: input.query };

    return applyRetrievalTopKAlias({
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
    });
  }
}
