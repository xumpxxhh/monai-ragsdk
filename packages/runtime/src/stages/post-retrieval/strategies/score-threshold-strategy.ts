import type { RetrievalScoreKind } from '../../../types/index.js';
import type { PostRetrievalStrategy } from '../post-retrieval-strategy.js';

import { applyScoreThresholdStrategy } from './post-retrieval-strategies.js';

export function createScoreThresholdStrategy(input?: {
  scoreThreshold?: number;
  applyRequestScoreThreshold?: boolean;
  /** 阈值按该口径解释；实际口径不同则拒绝比较，避免把 0.2 打在 RRF 分上。 */
  expectedScoreKind?: RetrievalScoreKind;
}): PostRetrievalStrategy {
  return {
    name: 'score-threshold',
    async apply({ candidates, request }) {
      const scoreThreshold =
        input?.scoreThreshold ??
        (input?.applyRequestScoreThreshold !== false ? request.rerank?.minScore : undefined);
      const result = applyScoreThresholdStrategy(candidates, scoreThreshold, {
        expectedScoreKind: input?.expectedScoreKind,
      });

      return {
        selectedCandidates: result.selectedCandidates,
        droppedCandidates: result.droppedCandidates,
        selectionTrace: result.selectionTrace,
        appliedScoreThreshold: result.appliedScoreThreshold,
      };
    },
  };
}
