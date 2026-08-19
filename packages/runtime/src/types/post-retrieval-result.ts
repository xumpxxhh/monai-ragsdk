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
  /** 实际跑过的 post-retrieval 策略名，按执行顺序。 */
  appliedStrategies?: string[];
  postRetrievalMetadata?: Record<string, JsonValue>;
};
