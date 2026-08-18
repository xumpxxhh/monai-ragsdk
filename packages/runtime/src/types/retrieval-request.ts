import type { JsonValue, Query } from "@monai-ragsdk/core";

import type { RetrievalBudget } from "./retrieval-budget.js";
import type { RetrievalFilters } from "./retrieval-filters.js";
import type { RetrievalRerankPolicy } from "./retrieval-rerank-policy.js";

export type RetrievalRequest = {
  originalQuery: Query;
  effectiveQuery: Query;
  /** 由 expansion / decomposition / multi-query 等 pre-retrieval 策略产出；retrieval 阶段 fan-out 消费。 */
  subQueries?: Query[];
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
