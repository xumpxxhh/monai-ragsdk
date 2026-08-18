import type { PostRetrievalStrategy } from '../post-retrieval-strategy.js';

import { applyLostInTheMiddleStrategy } from './post-retrieval-strategies.js';

/** Lost in the Middle 首尾重排；默认不启用，需显式加入策略数组。 */
export function createLostInTheMiddleStrategy(): PostRetrievalStrategy {
  return {
    async apply({ candidates }) {
      const result = applyLostInTheMiddleStrategy(candidates);

      return {
        selectedCandidates: result.candidates,
        droppedCandidates: [],
        selectionTrace: result.selectionTrace,
      };
    },
  };
}
