import type { Query } from '@monai-ragsdk/core';

import type { RetrievalRequest } from '../../../types/index.js';

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * 组装 fan-out 用的 subQueries：按出现顺序去重，可选把当前 effectiveQuery 放在最前。
 * 列表策略覆盖既有 subQueries，避免 rewrite 之后再 expansion 时混入过期改写。
 */
export function buildSubQueries(input: {
  original: Query;
  generated: string[];
  includeOriginal: boolean;
  maxQueries: number;
}): Query[] | undefined {
  const queries: Query[] = [];
  const seen = new Set<string>();

  const push = (query: string): void => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return;
    }

    const key = normalize(trimmed);
    if (seen.has(key) || queries.length >= input.maxQueries) {
      return;
    }

    seen.add(key);
    queries.push({ query: trimmed });
  };

  if (input.includeOriginal) {
    push(input.original.query);
  }

  for (const generated of input.generated) {
    push(generated);
  }

  if (queries.length === 0) {
    return undefined;
  }

  return queries;
}

export function withSubQueries(
  request: RetrievalRequest,
  subQueries: Query[] | undefined,
  strategy: string,
): RetrievalRequest {
  if (!subQueries || subQueries.length === 0) {
    return request;
  }

  // 只有一条且等于 effectiveQuery 时不必挂 subQueries，FanOut 会退化为单次检索
  if (subQueries.length === 1 && subQueries[0]?.query === request.effectiveQuery.query) {
    return request;
  }

  return {
    ...request,
    subQueries,
    strategy: request.strategy ?? strategy,
  };
}
