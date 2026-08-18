import type { QueryStrategy } from '../query-strategy.js';
import type { RetrievalRequest, RuntimeContext } from '../../../types/index.js';

import { buildSubQueries, withSubQueries } from './build-sub-queries.js';
import { completeQueryStrategyModel } from './complete-query-strategy.js';
import type { LlmQueryStrategyOptions } from './llm-query-strategy-options.js';
import { parseQueryList } from './parse-strategy-model-text.js';

const DEFAULT_COUNT = 3;
const DEFAULT_SYSTEM =
  '你为同一检索意图生成多种措辞不同的查询，用于多路召回。不要改变意图，不要回答问题。';

export type MultiQueryStrategyOptions = LlmQueryStrategyOptions & {
  /** 额外生成的改写条数，不含原 query；默认 3。 */
  count?: number;
  /** 是否把当前 effectiveQuery 放进 subQueries 首位；默认 true。 */
  includeOriginal?: boolean;
};

function buildPrompt(query: string, count: number): string {
  return [
    `为下面的问题生成 ${count} 条措辞不同、意图相同的检索查询。`,
    '只输出 JSON：{"queries":["查询1","查询2"]}',
    '不要重复原问题原文，不要引入新的约束。',
    '',
    `问题：${query}`,
  ].join('\n');
}

/**
 * 多路改写同一意图，写入 subQueries 供 FanOutRetriever 融合。
 * 与 expansion 的差别：不追求相邻概念，只换表述；失败则透传。
 */
export function createMultiQueryStrategy(options: MultiQueryStrategyOptions): QueryStrategy {
  const count = options.count ?? DEFAULT_COUNT;
  const includeOriginal = options.includeOriginal !== false;
  const maxQueries = includeOriginal ? count + 1 : count;

  return {
    async apply(request: RetrievalRequest, context: RuntimeContext): Promise<RetrievalRequest> {
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
          throw new Error('multi-query strategy model returned empty text');
        }

        return request;
      }

      const generated = parseQueryList(text, count);

      if (generated.length === 0) {
        if (options.onError === 'throw') {
          throw new Error('multi-query strategy could not parse queries');
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
        'multi-query',
      );
    },
  };
}
