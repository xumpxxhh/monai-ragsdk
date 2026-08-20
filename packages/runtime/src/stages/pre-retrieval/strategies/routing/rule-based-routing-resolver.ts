import type { RetrievalRequest } from '../../../../types/retrieval-request.js';
import type { RuntimeContext } from '../../../../types/runtime-context.js';

import type { RoutingResolveResult, RoutingResolver, RoutingRule } from './routing-resolver.js';

export type RuleBasedRoutingResolverOptions = {
  rules: RoutingRule[];
};

/**
 * 按规则数组顺序命中即返回。映射表只活在规则里，retrieval 不再维护第二份 route→retriever 字典。
 */
export class RuleBasedRoutingResolver implements RoutingResolver {
  readonly #rules: RoutingRule[];

  constructor(options: RuleBasedRoutingResolverOptions) {
    this.#rules = options.rules;
  }

  async resolve(
    query: string,
    request: RetrievalRequest,
    _context: RuntimeContext,
  ): Promise<RoutingResolveResult | undefined> {
    const rule = this.#rules.find((candidate) => candidate.match(query, request));
    if (!rule) {
      return undefined;
    }

    return {
      decision: rule.decision,
      route: rule.decision.targets?.[0],
    };
  }
}
