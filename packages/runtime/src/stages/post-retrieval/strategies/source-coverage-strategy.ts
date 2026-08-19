import type { PostRetrievalStrategy } from '../post-retrieval-strategy.js';

import {
  applySourceCoverageStrategy,
  type SourceCoverageConfig,
} from './post-retrieval-strategies.js';

export function createSourceCoverageStrategy(config?: SourceCoverageConfig): PostRetrievalStrategy {
  return {
    name: 'source-coverage',
    async apply({ candidates }) {
      const result = applySourceCoverageStrategy(candidates, config);

      return {
        selectedCandidates: result.selectedCandidates,
        droppedCandidates: result.droppedCandidates,
        selectionTrace: result.selectionTrace,
      };
    },
  };
}
