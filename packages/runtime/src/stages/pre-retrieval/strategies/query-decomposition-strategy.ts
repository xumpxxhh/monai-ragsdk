import type { QueryStrategy } from '../query-strategy.js';
import type { RetrievalRequest, RuntimeContext } from '../../../types/index.js';

import { buildSubQueries, withSubQueries } from './build-sub-queries.js';
import { completeQueryStrategyModel, isBlankEffectiveQuery } from './complete-query-strategy.js';
import type { LlmQueryStrategyOptions } from './llm-query-strategy-options.js';
import { parseQueryList } from './parse-strategy-model-text.js';

const DEFAULT_COUNT = 3;
const DEFAULT_SYSTEM =
  '你把复杂问题拆成彼此独立、可单独检索的子问题。不要回答问题，不要输出无法独立检索的碎片。';

export type QueryDecompositionStrategyOptions = LlmQueryStrategyOptions & {
  /** 最多拆出的子问题数；默认 3。 */
  count?: number;
  /** 是否把原问题也放入 subQueries；默认 false，避免复合问句再次稀释召回。 */
  includeOriginal?: boolean;
};

function buildPrompt(query: string, count: number): string {
  return [
    `把下面的问题拆成最多 ${count} 个可独立检索的子问题。`,
    '只输出 JSON：{"queries":["子问题1","子问题2"]}',
    '若原问题已经足够简单，可以只返回一条与原问题等价的查询。',
    '',
    `问题：${query}`,
  ].join('\n');
}

/**
 * 把复合问题拆成子问题写入 subQueries，供 FanOutRetriever 分别检索。
 * 默认不把原复合问句放进列表；失败则透传。
 */
export function createQueryDecompositionStrategy(
  options: QueryDecompositionStrategyOptions,
): QueryStrategy {
  const count = options.count ?? DEFAULT_COUNT;
  const includeOriginal = options.includeOriginal === true;
  const maxQueries = includeOriginal ? count + 1 : count;

  return {
    name: 'query-decomposition',
    async apply(request: RetrievalRequest, context: RuntimeContext): Promise<RetrievalRequest> {
      if (isBlankEffectiveQuery(request.effectiveQuery.query)) {
        return request;
      }

      const text = await completeQueryStrategyModel(
        options.model,
        {
          prompt: buildPrompt(request.effectiveQuery.query, count),
          system: options.system ?? DEFAULT_SYSTEM,
        },
        context,
        options.onError,
      );

      if (!text) {
        if (options.onError === 'throw') {
          throw new Error('query decomposition strategy model returned empty text');
        }

        return request;
      }

      const generated = parseQueryList(text, count);

      if (generated.length === 0) {
        if (options.onError === 'throw') {
          throw new Error('query decomposition strategy could not parse queries');
        }

        return request;
      }

      return withSubQueries(
        request,
        buildSubQueries({
          original: request.effectiveQuery,
          generated,
          includeOriginal,
          maxQueries,
        }),
        'query-decomposition',
      );
    },
  };
}
