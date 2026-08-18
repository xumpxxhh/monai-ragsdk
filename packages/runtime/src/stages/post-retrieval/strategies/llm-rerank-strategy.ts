import type { Query } from "@monai-ragsdk/core";

import type {
  PostRetrievalStrategy,
  PostRetrievalStrategyResult,
} from "../post-retrieval-strategy.js";

import type {
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
} from "../../../types/index.js";

import type {
  RuntimeStrategyModel,
  RuntimeStrategyModelInput,
} from "../../../types/index.js";

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

function toCandidateId(
  value: unknown,
): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

type RankedItem = {
  chunkId: string;
  score?: number;
};

function parseRanked(
  text: string,
): { ranked: RankedItem[] } | undefined {
  const json = extractJson(text);
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return undefined;
  }

  const obj = json as Record<string, unknown>;

  // { ranked: [{chunkId, score}] }
  const rankedValue = obj["ranked"];
  if (Array.isArray(rankedValue)) {
    const ranked: RankedItem[] = [];

    for (const item of rankedValue) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const id = toCandidateId((item as Record<string, unknown>)["chunkId"]);
      if (!id) {
        continue;
      }
      const scoreValue = (item as Record<string, unknown>)["score"];
      const score =
        typeof scoreValue === "number" && Number.isFinite(scoreValue)
          ? scoreValue
          : undefined;
      ranked.push({ chunkId: id, score });
    }

    return ranked.length > 0 ? { ranked } : undefined;
  }

  // { ordered: ["id1","id2"] }
  const orderedValue = obj["ordered"];
  if (Array.isArray(orderedValue)) {
    const ids = orderedValue
      .map((id) => toCandidateId(id))
      .filter((id): id is string => typeof id === "string");

    if (ids.length === 0) {
      return undefined;
    }

    return { ranked: ids.map((chunkId) => ({ chunkId })) };
  }

  return undefined;
}

export type LlmRerankStrategyOptions = {
  model: RuntimeStrategyModel;
  systemPrompt?: string;
  /** LLM 评分输入的每个候选内容截断上限（字符数），避免超长 prompt。 */
  candidateMaxChars?: number;
  /** LLM 输出的重排序数量上限；若 < candidates.length，会把被截断的其余候选放在后面。 */
  maxCandidatesForPrompt?: number;
  onError?: "passthrough" | "throw";
};

function buildPrompt(
  query: Query,
  candidates: RetrievalCandidate[],
  candidateMaxChars: number,
): RuntimeStrategyModelInput {
  const context = candidates
    .map((candidate, idx) => {
      const text = candidate.chunk.content ?? "";
      const trimmed =
        text.length > candidateMaxChars ? text.slice(0, candidateMaxChars) : text;

      const preview = trimmed.replace(/\s+/g, " ").trim();
      return `[#${idx + 1}] chunkId=${candidate.chunk.id}\ncontent=${preview}`;
    })
    .join("\n\n");

  return {
    prompt: [
      "请根据 query 与每个候选内容的相关性进行重排序。",
      "只输出 JSON，不要回答问题本身。",
      "输出格式：{ \"ranked\": [{\"chunkId\":\"...\",\"score\": number}, ...] }",
      "",
      `query=${query.query}`,
      "",
      "candidates=",
      context,
    ].join("\n"),
  };
}

function buildSelectionTrace(
  candidates: RetrievalCandidate[],
  ordered: string[],
  scoreById: Map<string, number | undefined>,
): PostRetrievalStrategyResult["selectionTrace"] {
  return ordered.map((chunkId, order) => {
    const candidate = candidates.find((c) => c.chunk.id === chunkId)!;
    const score = scoreById.get(chunkId);

    return {
      candidate,
      selected: true,
      reason: "selected",
      stage: "context-ordering",
      score,
      order,
      metadata: {
        rerankProvider: "llm",
      },
    };
  });
}

/**
 * LLM Reranking：对 retrieval candidates 做真实相关性重排。
 *
 * 设计选择：
 * - 不做丢弃（drop）让后续 budget / 去重策略保持语义一致；
 * - 如 LLM 失败或 JSON 解析失败：默认透传（不改变候选顺序）。
 * - 若 LLM 返回 score：写回 candidate.score，便于后续 score-threshold 策略消费。
 */
export function createLlmRerankStrategy(
  options: LlmRerankStrategyOptions,
): PostRetrievalStrategy {
  const onError = options.onError ?? "passthrough";
  const candidateMaxChars = options.candidateMaxChars ?? 800;
  const maxCandidatesForPrompt = options.maxCandidatesForPrompt ?? 12;

  return {
    async apply(
      input: { request: RetrievalRequest; candidates: RetrievalCandidate[] },
      context: RuntimeContext,
    ): Promise<PostRetrievalStrategyResult> {
      const request = input.request;
      const candidates = input.candidates;

      // 给 runtime debug 的可观测字段；mutation 是可控副作用，仅用于诊断。
      request.rerank = request.rerank ?? { strategy: "llm-rerank" };
      request.rerank.strategy = "llm-rerank";

      const subset = candidates.slice(0, maxCandidatesForPrompt);

      let modelText: string | undefined;
      try {
        const systemPrompt =
          options.systemPrompt ??
          "你是检索重排序器。只根据 query 与候选内容的相关性判断，不要引入额外假设。";

        const modelInput: RuntimeStrategyModelInput = {
          ...buildPrompt(request.effectiveQuery, subset, candidateMaxChars),
          system: systemPrompt,
        };

        const out = await options.model.complete(modelInput, context);
        modelText = out?.trim();

        if (!modelText) {
          if (onError === "throw") {
            throw new Error("llm rerank returned empty text");
          }
          return {
            selectedCandidates: candidates,
            droppedCandidates: [],
          };
        }
      } catch (error) {
        if (onError === "throw") {
          throw error;
        }
        return {
          selectedCandidates: candidates,
          droppedCandidates: [],
        };
      }

      const parsed = parseRanked(modelText!);
      if (!parsed) {
        if (onError === "throw") {
          throw new Error("llm rerank could not parse ranked result");
        }
        return {
          selectedCandidates: candidates,
          droppedCandidates: [],
        };
      }

      const rankedIds = parsed.ranked.map((item) => item.chunkId);
      const uniqueIds: string[] = [];
      const seen = new Set<string>();
      for (const id of rankedIds) {
        if (!seen.has(id)) {
          seen.add(id);
          uniqueIds.push(id);
        }
      }

      const scoreById = new Map<string, number | undefined>();
      for (const item of parsed.ranked) {
        scoreById.set(item.chunkId, item.score);
      }

      const idToCandidate = new Map(candidates.map((c) => [c.chunk.id, c]));

      const orderedTop = uniqueIds
        .map((id) => idToCandidate.get(id))
        .filter((c): c is RetrievalCandidate => Boolean(c));

      const remaining = candidates
        .filter((c) => !uniqueIds.includes(c.chunk.id))
        .slice(0);

      const reordered = [...orderedTop, ...remaining];

      // 写回 score（只写入 LLM 返回的那些候选；其余保持原 score）
      const finalCandidates = reordered.map((c) => {
        const nextScore = scoreById.has(c.chunk.id) ? scoreById.get(c.chunk.id) : c.score;
        return nextScore !== undefined
          ? { ...c, score: nextScore }
          : c;
      });

      const selectionTrace = buildSelectionTrace(
        finalCandidates,
        finalCandidates.map((c) => c.chunk.id),
        scoreById,
      );

      return {
        selectedCandidates: finalCandidates,
        droppedCandidates: [],
        selectionTrace,
      };
    },
  };
}

