import type { PostRetrievalStrategy } from '../post-retrieval-strategy.js';
import type { RuntimeContext } from '../../../types/index.js';

import {
  applyCandidateOrderingStrategy,
  type CandidateComparator,
} from './post-retrieval-strategies.js';

export function createCandidateOrderingStrategy(
  comparator?: CandidateComparator,
): PostRetrievalStrategy {
  return {
    name: 'context-ordering',
    async apply({ candidates, request }, context: RuntimeContext) {
      const result = applyCandidateOrderingStrategy(candidates, comparator, {
        request,
        context,
      });

      return {
        selectedCandidates: result.candidates,
        droppedCandidates: [],
        selectionTrace: result.selectionTrace,
      };
    },
  };
}
