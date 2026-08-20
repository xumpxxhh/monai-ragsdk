import type { QueryStrategy } from '../query-strategy.js';

import type { RetrievalRequest, RuntimeContext } from '../../../types/index.js';

import type { LlmQueryStrategyOptions } from './llm-query-strategy-options.js';
import { isBlankEffectiveQuery } from './complete-query-strategy.js';
import {
  LlmRoutingResolver,
  RuleBasedRoutingResolver,
  type RoutingResolver,
  type RoutingRule,
} from './routing/index.js';

export type QueryRoutingStrategyBaseOptions = {
  resolver?: RoutingResolver;
  /** LLM 输出缺省 route 时使用该值；默认 `undefined`（透传 request.route）。 */
  defaultRoute?: string;
  /** 是否把 route 写入 request.strategy，便于后续 debug。 */
  alsoSetStrategy?: boolean;
};

/**
 * @deprecated 有 `model` 无 `resolver` 时内部创建 `LlmRoutingResolver`。
 * 新代码请用 `createLlmRoutingStrategy` / `createRuleBasedRoutingStrategy`。
 */
export type QueryRoutingStrategyOptions = LlmQueryStrategyOptions &
  QueryRoutingStrategyBaseOptions & {
    availableTargets?: string[];
  };

export type LlmRoutingStrategyOptions = LlmQueryStrategyOptions &
  Omit<QueryRoutingStrategyBaseOptions, 'resolver'> & {
    availableTargets?: string[];
  };

export type RuleBasedRoutingStrategyOptions = Omit<QueryRoutingStrategyBaseOptions, 'resolver'> & {
  rules: RoutingRule[];
};

/**
 * Query Routing：把 resolver 的决策写入 `routeDecision`，可选写 route / budget / filters。
 * 有决策或可用 route 才写 `rewriteReason`；否则整单透传，避免审计看起来已经路由过。
 * LLM 的 topK 只进 `budget.maxChunks`，不写 `request.topK`。
 */
export function createRoutingStrategy(
  options: QueryRoutingStrategyBaseOptions & { resolver: RoutingResolver },
): QueryStrategy {
  const alsoSetStrategy = options.alsoSetStrategy ?? true;

  return {
    name: 'query-routing',
    async apply(request: RetrievalRequest, context: RuntimeContext): Promise<RetrievalRequest> {
      if (isBlankEffectiveQuery(request.effectiveQuery.query)) {
        return request;
      }

      const resolved = await options.resolver.resolve(
        request.effectiveQuery.query,
        request,
        context,
      );
      if (!resolved) {
        return request;
      }

      const route = resolved.route ?? resolved.decision?.targets?.[0] ?? options.defaultRoute;
      if (!resolved.decision && !route) {
        return request;
      }

      const next: RetrievalRequest = {
        ...request,
        rewriteReason: 'query-routing',
        ...(resolved.decision ? { routeDecision: resolved.decision } : {}),
        ...(route ? { route } : {}),
        strategy: alsoSetStrategy && route ? (request.strategy ?? route) : request.strategy,
      };

      if (resolved.budget) {
        next.budget = {
          ...(next.budget ?? {}),
          ...resolved.budget,
        };
      }

      if (resolved.filters) {
        next.filters = {
          ...(next.filters ?? {}),
          ...resolved.filters,
        };
      }

      return next;
    },
  };
}

export function createLlmRoutingStrategy(options: LlmRoutingStrategyOptions): QueryStrategy {
  return createRoutingStrategy({
    ...options,
    resolver: new LlmRoutingResolver({
      model: options.model,
      availableTargets: options.availableTargets,
      system: options.system,
      onError: options.onError,
      defaultRoute: options.defaultRoute,
    }),
  });
}

export function createRuleBasedRoutingStrategy(
  options: RuleBasedRoutingStrategyOptions,
): QueryStrategy {
  return createRoutingStrategy({
    ...options,
    resolver: new RuleBasedRoutingResolver({ rules: options.rules }),
  });
}

/**
 * @deprecated 请改用 `createLlmRoutingStrategy`。保留是为了旧调用方仍能写 `route` 与 budget。
 */
export function createQueryRoutingStrategy(options: QueryRoutingStrategyOptions): QueryStrategy {
  const resolver =
    options.resolver ??
    new LlmRoutingResolver({
      model: options.model,
      availableTargets: options.availableTargets,
      system: options.system,
      onError: options.onError,
      defaultRoute: options.defaultRoute,
    });

  return createRoutingStrategy({
    ...options,
    resolver,
  });
}
