import type { PostRetrievalStrategy } from "../post-retrieval-strategy.js";
import type { RuntimeContext } from "../../../types/index.js";

import {
  applyNearDuplicateRemovalStrategy,
  type NearDuplicateRemovalConfig,
} from "./post-retrieval-strategies.js";

export function createNearDuplicateRemovalStrategy(
  config?: NearDuplicateRemovalConfig,
): PostRetrievalStrategy {
  return {
    async apply({ candidates, request }, context: RuntimeContext) {
      const result = applyNearDuplicateRemovalStrategy(candidates, config, {
        request,
        context,
      });

      return {
        selectedCandidates: result.selectedCandidates,
        droppedCandidates: result.droppedCandidates,
        selectionTrace: result.selectionTrace,
      };
    },
  };
}
