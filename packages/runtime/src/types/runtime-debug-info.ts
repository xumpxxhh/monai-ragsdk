import type { RuntimeStage } from "./runtime-stage.js";
import type { RetrievalBudget } from "./retrieval-budget.js";
import type { RetrievalFilters } from "./retrieval-filters.js";
import type { PostRetrievalSelectionTraceEntry } from "./post-retrieval-selection-trace.js";

export type RuntimeDebugInfo = {
  timings: Partial<Record<RuntimeStage | "total", number>>;
  route?: string;
  rewriteReason?: string;
  retrievalStrategy?: string;
  rerankStrategy?: string;
  indexingMode?: "full" | "incremental";
  filters?: RetrievalFilters;
  retrievedCount: number;
  selectedCount: number;
  droppedCount: number;
  finalChunkCount: number;
  appliedBudget?: RetrievalBudget;
  appliedScoreThreshold?: number;
  selectionTrace?: PostRetrievalSelectionTraceEntry[];
  promptContext?: string;
};
