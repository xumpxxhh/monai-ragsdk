import type { PostRetrievalStrategy } from "../post-retrieval-strategy.js";
import type { RuntimeContext } from "../../../types/index.js";

import {
  applyCandidatePredicateStrategy,
  type CandidatePredicate,
} from "./post-retrieval-strategies.js";

export function createPredicateFilterStrategy(
  predicate?: CandidatePredicate,
): PostRetrievalStrategy {
  return {
    async apply({ candidates, request }, context: RuntimeContext) {
      const result = await applyCandidatePredicateStrategy(
        candidates,
        predicate,
        { request, context },
      );

      return {
        selectedCandidates: result.selectedCandidates,
        droppedCandidates: result.droppedCandidates,
        selectionTrace: result.selectionTrace,
      };
    },
  };
}
