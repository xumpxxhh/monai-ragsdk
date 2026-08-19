import type { RetrievalRequest } from '../../types/index.js';

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * 把历史别名 `topK` 补进权威字段 `budget.maxChunks`。
 * 只在权威字段缺省时写入，避免「审计报 topK、执行按另一套 maxChunks」对不上账。
 * 二者都有时不覆盖 budget——调用方同时传冲突值时以权威字段为准。
 */
export function applyRetrievalTopKAlias(request: RetrievalRequest): RetrievalRequest {
  if (!isPositiveInt(request.topK) || isPositiveInt(request.budget?.maxChunks)) {
    return request;
  }

  return {
    ...request,
    budget: {
      ...(request.budget ?? {}),
      maxChunks: request.topK,
    },
  };
}
