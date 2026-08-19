import type { PostRetrievalStrategy } from '../post-retrieval-strategy.js';
import type { RetrievalBudget } from '../../../types/index.js';

import { applyBudgetTrimStrategy } from './post-retrieval-strategies.js';

export function createBudgetTrimStrategy(input?: {
  budget?: RetrievalBudget;
  applyRequestBudget?: boolean;
}): PostRetrievalStrategy {
  return {
    name: 'budget-trim',
    async apply({ candidates, request }) {
      const budget =
        input?.budget ?? (input?.applyRequestBudget === false ? undefined : request.budget);
      const result = applyBudgetTrimStrategy(candidates, budget);

      return {
        selectedCandidates: result.selectedCandidates,
        droppedCandidates: result.droppedCandidates,
        selectionTrace: result.selectionTrace,
        appliedBudget: result.appliedBudget,
      };
    },
  };
}
