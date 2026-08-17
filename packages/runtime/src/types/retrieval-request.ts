import type { JsonValue, Query } from "@monai-ragsdk/core";

import type { RetrievalBudget } from "./retrieval-budget.js";
import type { RetrievalFilters } from "./retrieval-filters.js";
import type { RetrievalRerankPolicy } from "./retrieval-rerank-policy.js";

export type RetrievalRequest = {
  originalQuery: Query;
  effectiveQuery: Query;
  topK?: number;
  filters?: RetrievalFilters;
  strategy?: string;
  route?: string;
  rewriteReason?: string;
  indexingMode?: "full" | "incremental";
  budget?: RetrievalBudget;
  rerank?: RetrievalRerankPolicy;
  metadata?: Record<string, JsonValue>;
};
