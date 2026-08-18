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
  postRetrievalMetadata?: Record<string, JsonValue>;
};
