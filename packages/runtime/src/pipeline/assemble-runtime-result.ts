import type {
  JsonValue,
  RAGBudget,
  RAGCounts,
  RAGCitation,
  RAGFilters,
  RAGRerank,
  RAGRetrievedCandidate,
  RAGSelectionTraceEntry,
  RAGStageStrategies,
  RAGTimings,
} from '@monai-ragsdk/core';

import type { PostRetrievalResult } from '../types/post-retrieval-result.js';
import type { PostRetrievalSelectionTraceEntry } from '../types/post-retrieval-selection-trace.js';
import type { RetrievalBudget } from '../types/retrieval-budget.js';
import type { RetrievalCandidate } from '../types/retrieval-candidate.js';
import type { RetrievalFilters } from '../types/retrieval-filters.js';
import type { RetrievalRequest } from '../types/retrieval-request.js';
import type { RetrievalRerankPolicy } from '../types/retrieval-rerank-policy.js';
import type { RuntimeDebugInfo } from '../types/runtime-debug-info.js';
import type { RuntimeGenerationResult } from '../types/runtime-generation-result.js';
import type { RuntimeResult } from '../types/runtime-result.js';
import type { RuntimeSearchResult } from '../types/runtime-search-result.js';
import type { RuntimeRetrievalResult } from '../types/runtime-retrieval-result.js';
import type { RuntimeStage } from '../types/runtime-stage.js';
import { buildRuntimeCitations } from './build-runtime-citations.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function readJsonString(value: JsonValue | undefined): string | undefined {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] | undefined {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!isNonEmptyString(value)) {
      continue;
    }

    const trimmed = value.trim();
    if (seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result.length > 0 ? result : undefined;
}

function toAuditBudget(budget?: RetrievalBudget): RAGBudget | undefined {
  if (!budget) {
    return undefined;
  }

  const next: RAGBudget = {
    ...(isPositiveInt(budget.maxCandidates) ? { maxCandidates: budget.maxCandidates } : {}),
    ...(isPositiveInt(budget.maxChunks) ? { maxChunks: budget.maxChunks } : {}),
    ...(isPositiveInt(budget.maxPromptChars) ? { maxPromptChars: budget.maxPromptChars } : {}),
  };

  return Object.keys(next).length > 0 ? next : undefined;
}

function toAuditFilters(filters?: RetrievalFilters): RAGFilters | undefined {
  if (!filters) {
    return undefined;
  }

  const next: RAGFilters = {
    ...(filters.sourceIds && filters.sourceIds.length > 0
      ? { sourceIds: filters.sourceIds.filter(isNonEmptyString) }
      : {}),
    ...(filters.fingerprints && filters.fingerprints.length > 0
      ? { fingerprints: filters.fingerprints.filter(isNonEmptyString) }
      : {}),
    ...(filters.hierarchyPaths && filters.hierarchyPaths.length > 0
      ? { hierarchyPaths: filters.hierarchyPaths.filter(isNonEmptyString) }
      : {}),
    ...(filters.parentHierarchyPaths && filters.parentHierarchyPaths.length > 0
      ? {
          parentHierarchyPaths: filters.parentHierarchyPaths.filter(isNonEmptyString),
        }
      : {}),
    ...(isNonNegativeInt(filters.minHierarchyDepth)
      ? { minHierarchyDepth: filters.minHierarchyDepth }
      : {}),
    ...(isNonNegativeInt(filters.maxHierarchyDepth)
      ? { maxHierarchyDepth: filters.maxHierarchyDepth }
      : {}),
    ...(filters.metadata ? { metadata: filters.metadata } : {}),
  };

  return Object.keys(next).length > 0 ? next : undefined;
}

function toAuditRerank(rerank?: RetrievalRerankPolicy): RAGRerank | undefined {
  if (!rerank) {
    return undefined;
  }

  const next: RAGRerank = {
    ...(isNonEmptyString(rerank.strategy) ? { strategy: rerank.strategy.trim() } : {}),
    ...(isPositiveInt(rerank.topK) ? { topK: rerank.topK } : {}),
    ...(isFiniteNumber(rerank.minScore) ? { minScore: rerank.minScore } : {}),
  };

  return Object.keys(next).length > 0 ? next : undefined;
}

function toRetrievedCandidates(candidates: RetrievalCandidate[]): RAGRetrievedCandidate[] {
  return candidates.map((candidate) => {
    const item: RAGRetrievedCandidate = {
      chunkId: candidate.chunk.id,
    };

    if (isFiniteNumber(candidate.score)) {
      item.score = candidate.score;
    }

    if (isNonEmptyString(candidate.sourceId)) {
      item.sourceId = candidate.sourceId;
    }

    if (isNonEmptyString(candidate.strategy)) {
      item.strategy = candidate.strategy;
    }

    if (isNonEmptyString(candidate.route)) {
      item.route = candidate.route;
    }

    return item;
  });
}

function toAuditSelectionTrace(
  entries: PostRetrievalSelectionTraceEntry[],
): RAGSelectionTraceEntry[] {
  return entries.map((entry) => {
    const item: RAGSelectionTraceEntry = {
      chunkId: entry.candidate.chunk.id,
      selected: entry.selected,
      reason: entry.reason,
    };

    if (isNonEmptyString(entry.stage)) {
      item.stage = entry.stage;
    }

    if (isFiniteNumber(entry.score ?? entry.candidate.score)) {
      item.score = entry.score ?? entry.candidate.score;
    }

    if (isNonNegativeInt(entry.order)) {
      item.order = entry.order;
    }

    if (isNonEmptyString(entry.candidate.sourceId)) {
      item.sourceId = entry.candidate.sourceId;
    }

    if (isNonEmptyString(entry.candidate.fingerprint)) {
      item.fingerprint = entry.candidate.fingerprint;
    }

    if (entry.candidate.compressed) {
      item.compressed = true;
    }

    if (isNonEmptyString(entry.candidate.originalContent)) {
      item.originalContent = entry.candidate.originalContent;
    }

    return item;
  });
}

function toAuditTimings(
  timings: Partial<Record<RuntimeStage | 'total', number>>,
): RAGTimings | undefined {
  const next: RAGTimings = {
    ...(isFiniteNumber(timings['pre-retrieval']) && timings['pre-retrieval'] >= 0
      ? { preRetrieval: timings['pre-retrieval'] }
      : {}),
    ...(isFiniteNumber(timings.retrieval) && timings.retrieval >= 0
      ? { retrieval: timings.retrieval }
      : {}),
    ...(isFiniteNumber(timings['post-retrieval']) && timings['post-retrieval'] >= 0
      ? { postRetrieval: timings['post-retrieval'] }
      : {}),
    ...(isFiniteNumber(timings.generation) && timings.generation >= 0
      ? { generation: timings.generation }
      : {}),
    ...(isFiniteNumber(timings.total) && timings.total >= 0 ? { total: timings.total } : {}),
  };

  return Object.keys(next).length > 0 ? next : undefined;
}

function orderedStrategyNames(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const next = values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  return next.length > 0 ? next : undefined;
}

function toAuditStrategies(input: {
  request: RetrievalRequest;
  retrievalResult: RuntimeRetrievalResult;
  postResult: PostRetrievalResult;
}): RAGStageStrategies | undefined {
  const retrievalProvider = readJsonString(input.retrievalResult.retrievalMetadata?.provider);
  const preRetrieval =
    orderedStrategyNames(input.request.appliedStrategies) ??
    uniqueStrings([input.request.strategy]);
  const postRetrieval =
    orderedStrategyNames(input.postResult.appliedStrategies) ??
    uniqueStrings([
      input.request.rerank?.strategy,
      ...(input.postResult.selectionTrace?.map((entry) => entry.stage) ?? []),
    ]);

  const next: RAGStageStrategies = {
    ...(preRetrieval ? { preRetrieval } : {}),
    ...(uniqueStrings([retrievalProvider])
      ? { retrieval: uniqueStrings([retrievalProvider]) }
      : {}),
    ...(postRetrieval ? { postRetrieval } : {}),
  };

  return Object.keys(next).length > 0 ? next : undefined;
}

function toAuditCounts(
  retrievalResult: RuntimeRetrievalResult,
  postResult: PostRetrievalResult,
): RAGCounts {
  const retrieved = retrievalResult.candidates.length;
  const selected = postResult.selectedCandidates?.length ?? postResult.chunks.length;
  const dropped = postResult.droppedCandidates?.length ?? Math.max(retrieved - selected, 0);

  return {
    retrieved,
    selected,
    dropped,
    finalChunks: postResult.chunks.length,
  };
}

function readGenerationModel(
  generationMetadata: RuntimeGenerationResult['generationMetadata'],
): string | undefined {
  return readJsonString(generationMetadata?.model);
}

export type AssembleRetrievalSnapshotInput = {
  postResult: PostRetrievalResult;
  retrievalResult: RuntimeRetrievalResult;
  request: RetrievalRequest;
  requestId: string;
  traceId: string;
  startedAt: number;
  timings: Partial<Record<RuntimeStage | 'total', number>>;
  debug?: RuntimeDebugInfo;
};

export type AssembleRuntimeResultInput = AssembleRetrievalSnapshotInput & {
  generationResult: RuntimeGenerationResult;
  streamed: boolean;
};

/**
 * 组装检索侧审计快照（不含 answer / streamed / generation 元数据）。
 * search() 直接对外返回；run() / runStream() 再补 generation 字段。
 */
export function assembleRuntimeSearchResult(
  input: AssembleRetrievalSnapshotInput,
): RuntimeSearchResult {
  const citations: RAGCitation[] = buildRuntimeCitations(input.postResult);
  const counts = toAuditCounts(input.retrievalResult, input.postResult);
  const droppedChunkIds = input.postResult.droppedCandidates?.map(
    (candidate) => candidate.chunk.id,
  );
  const rewriteReason =
    isNonEmptyString(input.request.rewriteReason) && input.request.rewriteReason !== 'query-routing'
      ? input.request.rewriteReason
      : undefined;
  const routeReason =
    input.request.rewriteReason === 'query-routing' ? input.request.rewriteReason : undefined;
  const strategies = toAuditStrategies(input);
  const filters = toAuditFilters(input.request.filters);
  const budget = toAuditBudget(input.request.budget);
  const appliedBudget = toAuditBudget(input.postResult.appliedBudget ?? input.request.budget);
  const rerank = toAuditRerank(input.request.rerank);
  const timings = toAuditTimings(input.timings);
  const snapshot: Omit<RuntimeSearchResult, 'debug'> = {
    chunks: input.postResult.chunks,
    citations,
    originalQuery: input.request.originalQuery,
    effectiveQuery: input.request.effectiveQuery,
    requestId: input.requestId,
    traceId: input.traceId,
    // 审计快照落盘/流通用毫秒时间戳，展示层再转 ISO
    startedAt: input.startedAt,
    endedAt: Date.now(),
    counts,
    retrievedCandidates: toRetrievedCandidates(input.retrievalResult.candidates),
    ...(input.request.subQueries && input.request.subQueries.length > 0
      ? { subQueries: input.request.subQueries }
      : {}),
    ...(rewriteReason ? { rewriteReason } : {}),
    ...(isNonEmptyString(input.request.route) ? { route: input.request.route } : {}),
    ...(routeReason ? { routeReason } : {}),
    ...(strategies ? { strategies } : {}),
    // 审计 topK 与执行条数同源：优先 budget.maxChunks，避免 request.topK=8 / maxChunks=2 对不上。
    ...(isPositiveInt(input.request.budget?.maxChunks)
      ? { topK: input.request.budget.maxChunks }
      : isPositiveInt(input.request.topK)
        ? { topK: input.request.topK }
        : {}),
    ...(filters ? { filters } : {}),
    ...(budget ? { budget } : {}),
    ...(appliedBudget ? { appliedBudget } : {}),
    ...(rerank ? { rerank } : {}),
    ...(input.request.indexingMode ? { indexingMode: input.request.indexingMode } : {}),
    ...(droppedChunkIds && droppedChunkIds.length > 0 ? { droppedChunkIds } : {}),
    ...(input.postResult.selectionTrace && input.postResult.selectionTrace.length > 0
      ? {
          selectionTrace: toAuditSelectionTrace(input.postResult.selectionTrace),
        }
      : {}),
    ...(isFiniteNumber(input.postResult.appliedScoreThreshold) ||
    isFiniteNumber(input.request.rerank?.minScore)
      ? {
          appliedScoreThreshold:
            input.postResult.appliedScoreThreshold ?? input.request.rerank?.minScore,
        }
      : {}),
    ...(timings ? { timings } : {}),
    ...(input.postResult.promptContext ? { promptContext: input.postResult.promptContext } : {}),
    ...(input.retrievalResult.retrievalMetadata
      ? { retrievalMetadata: input.retrievalResult.retrievalMetadata }
      : {}),
    ...(input.postResult.postRetrievalMetadata
      ? { postRetrievalMetadata: input.postResult.postRetrievalMetadata }
      : {}),
  };

  return {
    ...snapshot,
    ...(input.debug ? { debug: input.debug } : {}),
  };
}

/**
 * 把四阶段产物收成对外 RuntimeResult。
 * 审计具名字段始终写入（不依赖 includeDebug）；debug 仍只在调用方显式打开时附带完整过程对象。
 */
export function assembleRuntimeResult(input: AssembleRuntimeResultInput): RuntimeResult {
  const snapshot = assembleRuntimeSearchResult(input);
  const generationModel = readGenerationModel(input.generationResult.generationMetadata);

  return {
    ...snapshot,
    answer: input.generationResult.answer,
    streamed: input.streamed,
    ...(generationModel ? { generationModel } : {}),
    ...(input.generationResult.generationMetadata
      ? { generationMetadata: input.generationResult.generationMetadata }
      : {}),
  };
}
