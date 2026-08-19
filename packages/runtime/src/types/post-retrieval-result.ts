import type { Chunk, JsonValue } from '@monai-ragsdk/core';

import type { RetrievalBudget } from './retrieval-budget.js';
import type { RetrievalCandidate } from './retrieval-candidate.js';
import type { PostRetrievalSelectionTraceEntry } from './post-retrieval-selection-trace.js';

export type PostRetrievalResult = {
  chunks: Chunk[];
  promptContext?: string;
  selectedCandidates?: RetrievalCandidate[];
  droppedCandidates?: RetrievalCandidate[];
  selectionTrace?: PostRetrievalSelectionTraceEntry[];
  appliedBudget?: RetrievalBudget;
  appliedScoreThreshold?: number;
  /** 真正改了候选集合/顺序的策略名；透传不记。 */
  appliedStrategies?: string[];
  postRetrievalMetadata?: Record<string, JsonValue>;
};
