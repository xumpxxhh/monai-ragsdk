import type { QueryStrategy } from '../query-strategy.js';

import type { RetrievalRequest, RuntimeContext } from '../../../types/index.js';

import type { JsonValue } from '@monai-ragsdk/core';

import type { LlmQueryStrategyOptions } from './llm-query-strategy-options.js';
import { completeQueryStrategyModel } from './complete-query-strategy.js';

function extractJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

export type QueryRoutingStrategyOptions = LlmQueryStrategyOptions & {
  /** LLM 输出缺省 route 时使用该值；默认 `undefined`（透传 request.route）。 */
  defaultRoute?: string;
  /** 是否把 route 写入 request.strategy，便于后续 debug 与 retriever/adapter 使用。 */
  alsoSetStrategy?: boolean;
};

const DEFAULT_SYSTEM =
  '你是查询路由器。根据用户问题决定检索 route（用于选择检索/后处理配置）。\n' +
  '只输出 JSON，字段尽量精简：\n' +
  '{\n' +
  '  "route": "string",\n' +
  '  "topK": number  // 可选\n' +
  '  "budget": { "maxChunks": number, "maxPromptChars": number } // 可选\n' +
  '  "filters": { "metadata": { "key": "value" } } // 可选\n' +
  '}\n' +
  '不要回答问题本身。';

function buildPrompt(query: string): string {
  return [
    '请为下面的问题选择检索 route，并可选给出 topK / budget / filters。',
    '只输出 JSON，不要输出多余说明。',
    '',
    `问题：${query}`,
  ].join('\n');
}

/**
 * Query Routing：用 LLM 生成 `request.route`（以及可选 budget/topK/filters）。
 * - 路由写入能被 runtime debug 与后续适配（retriever/postprocessor）消费
 * - LLM 失败或输出无法解析：默认透传 request（避免策略链把检索拖死）
 */
export function createQueryRoutingStrategy(options: QueryRoutingStrategyOptions): QueryStrategy {
  const alsoSetStrategy = options.alsoSetStrategy ?? true;

  return {
    name: 'query-routing',
    async apply(request: RetrievalRequest, context: RuntimeContext): Promise<RetrievalRequest> {
      const text = await completeQueryStrategyModel(
        options.model,
        {
          prompt: buildPrompt(request.effectiveQuery.query),
          system: options.system ?? DEFAULT_SYSTEM,
        },
        context,
        options.onError,
      );

      if (!text) {
        if (options.onError === 'throw') {
          throw new Error('query routing strategy model returned empty text');
        }
        return request;
      }

      const json = extractJson(text);
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        if (options.onError === 'throw') {
          throw new Error('query routing strategy could not parse routing json');
        }
        return request;
      }

      const routeValue = (json as { route?: unknown }).route;
      const route =
        typeof routeValue === 'string' && routeValue.trim().length > 0
          ? routeValue.trim()
          : options.defaultRoute;

      const topK = (json as { topK?: unknown }).topK;
      const budget = (json as { budget?: unknown }).budget;
      const filters = (json as { filters?: unknown }).filters;

      if (!route && options.onError === 'passthrough') {
        return request;
      }

      const next: RetrievalRequest = {
        ...request,
        rewriteReason: 'query-routing',
        route: route ?? request.route,
        strategy: alsoSetStrategy ? (request.strategy ?? route) : request.strategy,
      };

      if (typeof topK === 'number' && Number.isFinite(topK) && topK > 0) {
        next.budget = {
          ...(next.budget ?? {}),
          maxChunks: topK,
        };
      }

      if (budget && typeof budget === 'object' && !Array.isArray(budget)) {
        const maxChunks = (budget as { maxChunks?: unknown }).maxChunks;
        const maxPromptChars = (budget as { maxPromptChars?: unknown }).maxPromptChars;
        next.budget = {
          ...(next.budget ?? {}),
          ...(typeof maxChunks === 'number' && maxChunks > 0 ? { maxChunks } : {}),
          ...(typeof maxPromptChars === 'number' && maxPromptChars > 0 ? { maxPromptChars } : {}),
        };
      }

      if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
        // filters 字段只做尽力映射：metadata 里只接受 string/number/boolean/null，不能保证严格 JsonValue 类型
        const metadata = (filters as { metadata?: unknown }).metadata;
        if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
          next.filters = {
            ...(next.filters ?? {}),
            // JSON.parse 的结果语义上满足 JsonValue；这里是类型层面的“受控断言”，避免阻断编译。
            metadata: metadata as Record<string, JsonValue>,
          };
        }
      }

      return next;
    },
  };
}
