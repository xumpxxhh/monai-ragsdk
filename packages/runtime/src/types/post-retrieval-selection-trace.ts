import type { JsonValue } from '@monai-ragsdk/core';

import type { RetrievalCandidate } from './retrieval-candidate.js';

export type PostRetrievalSelectionStage =
  | 'score-threshold'
  | 'predicate-filter'
  | 'duplicate-removal'
  | 'budget-trim'
  | 'source-coverage'
  | 'context-ordering'
  | 'llm-rerank'
  | 'context-compression';

export type PostRetrievalSelectionReason =
  | 'selected'
  | 'predicate-filter'
  | 'duplicate'
  | 'score-threshold'
  | 'score-kind-unknown'
  | 'score-kind-mismatch'
  | 'score-kind-unexpected'
  | 'source-coverage-quota'
  | 'max-candidates'
  | 'max-chunks'
  | 'max-prompt-chars';

export type PostRetrievalSelectionTraceEntry = {
  candidate: RetrievalCandidate;
  selected: boolean;
  reason: PostRetrievalSelectionReason;
  stage?: PostRetrievalSelectionStage;
  score?: number;
  order?: number;
  metadata?: Record<string, JsonValue>;
};
