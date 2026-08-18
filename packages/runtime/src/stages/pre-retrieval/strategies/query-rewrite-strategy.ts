import type { QueryStrategy } from "../query-strategy.js";
import type {
  RetrievalRequest,
  RuntimeContext,
} from "../../../types/index.js";

import { completeQueryStrategyModel } from "./complete-query-strategy.js";
import type { LlmQueryStrategyOptions } from "./llm-query-strategy-options.js";
import { parseRewrittenQuery } from "./parse-strategy-model-text.js";

const DEFAULT_SYSTEM =
  "你改写用户问题，使其更适合向量检索。只保留检索意图，不要回答问题，不要添加未在原问题中出现的约束。";

const DEFAULT_REWRITE_REASON = "query-rewrite";

export type QueryRewriteStrategyOptions = LlmQueryStrategyOptions & {
  rewriteReason?: string;
};

function buildPrompt(query: string): string {
  return [
    "把下面的问题改写成一条更适合检索的查询。",
    "只输出 JSON：{\"query\":\"改写后的查询\"}",
    "",
    `问题：${query}`,
  ].join("\n");
}

/**
 * 用 LLM 改写 effectiveQuery；失败或解析为空时默认透传，避免检索被策略拖死。
 * 不改 originalQuery，便于 debug 对照。
 */
export function createQueryRewriteStrategy(
  options: QueryRewriteStrategyOptions,
): QueryStrategy {
  return {
    async apply(
      request: RetrievalRequest,
      context: RuntimeContext,
    ): Promise<RetrievalRequest> {
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
        if (options.onError === "throw") {
          throw new Error("query rewrite strategy model returned empty text");
        }

        return request;
      }

      const rewritten = parseRewrittenQuery(text);

      if (!rewritten) {
        if (options.onError === "throw") {
          throw new Error("query rewrite strategy could not parse a query");
        }

        return request;
      }

      if (rewritten === request.effectiveQuery.query) {
        return request;
      }

      return {
        ...request,
        effectiveQuery: { query: rewritten },
        rewriteReason: options.rewriteReason ?? DEFAULT_REWRITE_REASON,
        strategy: request.strategy ?? "query-rewrite",
      };
    },
  };
}
