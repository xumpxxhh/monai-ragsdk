import type { JsonValue } from '@monai-ragsdk/core';

import type { RetrievalBudget } from '../../../../types/retrieval-budget.js';
import type { RetrievalFilters } from '../../../../types/retrieval-filters.js';
import type { RetrievalRequest } from '../../../../types/retrieval-request.js';
import type { RouteDecision, RouteRetrievalMode } from '../../../../types/route-decision.js';
import type { RuntimeContext } from '../../../../types/runtime-context.js';
import type { RuntimeStrategyModel } from '../../../../types/runtime-strategy-model.js';
import type { RuntimeRetrieverSearchType } from '../../../retrieval/runtime-retriever.js';

import type { QueryStrategyErrorMode } from '../llm-query-strategy-options.js';
import { completeQueryStrategyModel } from '../complete-query-strategy.js';
import { extractJsonValue } from '../parse-strategy-model-text.js';
import type { RoutingResolveResult, RoutingResolver } from './routing-resolver.js';

const SEARCH_TYPES: readonly RuntimeRetrieverSearchType[] = ['vector', 'keyword', 'hybrid'];
const RETRIEVAL_MODES: readonly RouteRetrievalMode[] = ['skip', 'single'];

const DEFAULT_SYSTEM =
  '你是查询路由器。根据用户问题决定检索目标与召回形态。\n' +
  '只输出 JSON，字段尽量精简：\n' +
  '{\n' +
  '  "route": "string",\n' +
  '  "targets": ["retriever-id"],\n' +
  '  "retrievalMode": "skip" | "single",\n' +
  '  "searchType": "vector" | "keyword" | "hybrid",\n' +
  '  "topK": number,\n' +
  '  "budget": { "maxChunks": number, "maxPromptChars": number },\n' +
  '  "filters": { "metadata": { "key": "value" } }\n' +
  '}\n' +
  'targets 必须来自可用目标列表。不要回答问题本身。';

export type LlmRoutingResolverOptions = {
  model: RuntimeStrategyModel;
  /** 写入 prompt，内核不校验 id 是否真实存在。 */
  availableTargets?: string[];
  system?: string;
  onError?: QueryStrategyErrorMode;
  defaultRoute?: string;
};

/**
 * 用 LLM 产出 RouteDecision。无法识别的 searchType / retrievalMode 默认丢弃该字段，
 * 避免半残 JSON 把整单检索拖死；onError 为 throw 时才视为路由失败。
 */
export class LlmRoutingResolver implements RoutingResolver {
  readonly #options: LlmRoutingResolverOptions;

  constructor(options: LlmRoutingResolverOptions) {
    this.#options = options;
  }

  async resolve(
    query: string,
    _request: RetrievalRequest,
    context: RuntimeContext,
  ): Promise<RoutingResolveResult | undefined> {
    const text = await completeQueryStrategyModel(
      this.#options.model,
      {
        prompt: buildPrompt(query, this.#options.availableTargets),
        system: this.#options.system ?? DEFAULT_SYSTEM,
      },
      context,
      this.#options.onError,
    );

    if (!text) {
      if (this.#options.onError === 'throw') {
        throw new Error('query routing strategy model returned empty text');
      }
      return undefined;
    }

    const json = extractJsonValue(text);
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      if (this.#options.onError === 'throw') {
        throw new Error('query routing strategy could not parse routing json');
      }
      return undefined;
    }

    return parseRoutingJson(json as Record<string, unknown>, this.#options);
  }
}

function buildPrompt(query: string, availableTargets: string[] | undefined): string {
  const targetsLine =
    availableTargets && availableTargets.length > 0
      ? `可用 targets：${JSON.stringify(availableTargets)}`
      : '可用 targets：未提供（可以只填 route）';

  return [
    '请为下面的问题选择检索 route / targets / retrievalMode / searchType，并可选给出 topK / budget / filters。',
    '只输出 JSON，不要输出多余说明。',
    targetsLine,
    '',
    `问题：${query}`,
  ].join('\n');
}

function parseRoutingJson(
  json: Record<string, unknown>,
  options: LlmRoutingResolverOptions,
): RoutingResolveResult | undefined {
  const onError = options.onError ?? 'passthrough';
  const availableTargets = options.availableTargets ?? [];

  const routeValue = json.route;
  const route =
    typeof routeValue === 'string' && routeValue.trim().length > 0
      ? routeValue.trim()
      : options.defaultRoute;

  const decision: RouteDecision = {};
  const parsedTargets = parseStringArray(json.targets);
  if (parsedTargets) {
    decision.targets = parsedTargets;
  } else if (route && availableTargets.includes(route)) {
    // 旧 prompt 只返回 route；若 route 本身就是 retriever id，映射成 targets 才能真正选路。
    decision.targets = [route];
  }

  const retrievalMode = parseEnum(json.retrievalMode, RETRIEVAL_MODES, 'retrievalMode', onError);
  if (retrievalMode) {
    decision.retrievalMode = retrievalMode;
  }

  const searchType = parseEnum(json.searchType, SEARCH_TYPES, 'searchType', onError);
  if (searchType) {
    decision.searchType = searchType;
  }

  const usableDecision = hasUsableDecision(decision);
  // 没有选路结果时不要吃 topK：否则审计会以为已经路由成功。
  if (!usableDecision && !route) {
    if (onError === 'throw') {
      throw new Error('query routing strategy could not determine route');
    }
    return undefined;
  }

  const budget = parseBudget(json.topK, json.budget);
  const filters = parseFilters(json.filters);

  return {
    ...(usableDecision ? { decision } : {}),
    ...(route ? { route } : {}),
    ...(budget ? { budget } : {}),
    ...(filters ? { filters } : {}),
  };
}

function hasUsableDecision(decision: RouteDecision): boolean {
  return (
    decision.targets !== undefined ||
    decision.retrievalMode !== undefined ||
    decision.searchType !== undefined
  );
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  onError: QueryStrategyErrorMode,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }

  if (onError === 'throw') {
    throw new Error(`query routing strategy received unrecognized ${field}`);
  }

  return undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim());
}

function parseBudget(topK: unknown, budget: unknown): RetrievalBudget | undefined {
  let next: RetrievalBudget | undefined;

  if (typeof topK === 'number' && Number.isFinite(topK) && topK > 0) {
    next = { maxChunks: topK };
  }

  if (budget && typeof budget === 'object' && !Array.isArray(budget)) {
    const maxChunks = (budget as { maxChunks?: unknown }).maxChunks;
    const maxPromptChars = (budget as { maxPromptChars?: unknown }).maxPromptChars;
    next = {
      ...(next ?? {}),
      ...(typeof maxChunks === 'number' && maxChunks > 0 ? { maxChunks } : {}),
      ...(typeof maxPromptChars === 'number' && maxPromptChars > 0 ? { maxPromptChars } : {}),
    };
  }

  return next && Object.keys(next).length > 0 ? next : undefined;
}

function parseFilters(filters: unknown): RetrievalFilters | undefined {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return undefined;
  }

  const metadata = (filters as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return {
    metadata: metadata as Record<string, JsonValue>,
  };
}
