import type { PostRetrievalStrategy } from '../post-retrieval-strategy.js';

import { applyScoreThresholdStrategy } from './post-retrieval-strategies.js';

export function createScoreThresholdStrategy(input?: {
  scoreThreshold?: number;
  applyRequestScoreThreshold?: boolean;
}): PostRetrievalStrategy {
  return {
    async apply({ candidates, request }) {
      const scoreThreshold =
        input?.scoreThreshold ??
        (input?.applyRequestScoreThreshold !== false ? request.rerank?.minScore : undefined);
      const result = applyScoreThresholdStrategy(candidates, scoreThreshold);

      return {
        selectedCandidates: result.selectedCandidates,
        droppedCandidates: result.droppedCandidates,
        selectionTrace: result.selectionTrace,
        appliedScoreThreshold: result.appliedScoreThreshold,
      };
    },
  };
}
