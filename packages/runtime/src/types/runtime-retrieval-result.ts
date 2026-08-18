import type { JsonValue } from '@monai-ragsdk/core';

import type { RetrievalCandidate } from './retrieval-candidate.js';

export type RuntimeRetrievalResult = {
  candidates: RetrievalCandidate[];
  retrievalMetadata?: Record<string, JsonValue>;
};
