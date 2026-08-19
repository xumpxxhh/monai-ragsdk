import type { QueryStrategy } from '../query-strategy.js';
import type { RetrievalRequest, RuntimeContext } from '../../../types/index.js';

import { buildSubQueries, withSubQueries } from './build-sub-queries.js';
import { completeQueryStrategyModel, isBlankEffectiveQuery } from './complete-query-strategy.js';
import type { LlmQueryStrategyOptions } from './llm-query-strategy-options.js';
import { parseQueryList } from './parse-strategy-model-text.js';

const DEFAULT_COUNT = 3;
const DEFAULT_SYSTEM = '你扩展用户问题的检索覆盖面，生成语义相关、措辞不同的查询。不要回答问题。';

export type QueryExpansionStrategyOptions = LlmQueryStrategyOptions & {
  /** 额外生成的查询条数，不含原 query；默认 3。 */
  count?: number;
  /** 是否把当前 effectiveQuery 放进 subQueries 首位；默认 true。 */
  includeOriginal?: boolean;
};

function buildPrompt(query: string, count: number): string {
  return [
    `为下面的问题生成 ${count} 条相关检索查询，用于扩大召回。`,
    '只输出 JSON：{"queries":["查询1","查询2"]}',
    '每条查询应覆盖原问题的不同措辞或相邻概念，不要重复原问题原文。',
    '',
    `问题：${query}`,
  ].join('\n');
}

/**
 * 用 LLM 生成相关查询并写入 subQueries，供 FanOutRetriever 多路召回。
 * 默认保留 effectiveQuery，失败则透传。
 */
export function createQueryExpansionStrategy(
  options: QueryExpansionStrategyOptions,
): QueryStrategy {
  const count = options.count ?? DEFAULT_COUNT;
  const includeOriginal = options.includeOriginal !== false;
  const maxQueries = includeOriginal ? count + 1 : count;

  return {
    name: 'query-expansion',
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
          throw new Error('query expansion strategy model returned empty text');
        }

        return request;
      }

      const generated = parseQueryList(text, count);

      if (generated.length === 0) {
        if (options.onError === 'throw') {
          throw new Error('query expansion strategy could not parse queries');
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
        'query-expansion',
      );
    },
  };
}
