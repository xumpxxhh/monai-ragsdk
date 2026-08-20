import type { RetrievalBudget } from '../../../../types/retrieval-budget.js';
import type { RetrievalFilters } from '../../../../types/retrieval-filters.js';
import type { RetrievalRequest } from '../../../../types/retrieval-request.js';
import type { RouteDecision } from '../../../../types/route-decision.js';
import type { RuntimeContext } from '../../../../types/runtime-context.js';

export type RoutingResolveResult = {
  decision?: RouteDecision;
  /** debug；缺省可由 strategy 填 `decision.targets?.[0]` */
  route?: string;
  budget?: RetrievalBudget;
  filters?: RetrievalFilters;
};

export interface RoutingResolver {
  resolve(
    query: string,
    request: RetrievalRequest,
    context: RuntimeContext,
  ): Promise<RoutingResolveResult | undefined>;
}

export type RoutingRule = {
  name: string;
  match: (query: string, request: RetrievalRequest) => boolean;
  decision: RouteDecision;
};
