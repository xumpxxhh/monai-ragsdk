import type { JsonValue } from '@monai-ragsdk/core';
import type { RuntimeResult, RuntimeSearchResult } from '@monai-ragsdk/runtime';

import type {
  PipelineSnapshot,
  PipelineSnapshotGeneration,
  PipelineSnapshotPostRetrieval,
  PipelineSnapshotPreRetrieval,
  PipelineSnapshotRetrieval,
  PipelineSnapshotTimings,
} from '../types/api.js';

type RuntimeAuditSnapshot = RuntimeSearchResult | RuntimeResult;

function readQueryText(value: { query: string } | undefined): string | undefined {
  const text = value?.query?.trim();
  return text && text.length > 0 ? text : undefined;
}

function readJsonString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readJsonBoolean(value: JsonValue | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readJsonNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readMetadata(
  metadata: Record<string, JsonValue> | undefined,
): Record<string, JsonValue> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  return metadata;
}

function toPreRetrieval(result: RuntimeAuditSnapshot): PipelineSnapshotPreRetrieval {
  const originalQuery = readQueryText(result.originalQuery) ?? '';
  const effectiveQuery = readQueryText(result.effectiveQuery) ?? originalQuery;

  return {
    originalQuery,
    effectiveQuery,
    ...(result.subQueries && result.subQueries.length > 0
      ? { subQueries: result.subQueries.map((item) => item.query) }
      : {}),
    ...(result.strategies?.preRetrieval && result.strategies.preRetrieval.length > 0
      ? { strategies: result.strategies.preRetrieval }
      : {}),
    ...(result.rewriteReason ? { rewriteReason: result.rewriteReason } : {}),
  };
}

function toRetrieval(result: RuntimeAuditSnapshot): PipelineSnapshotRetrieval {
  const metadata = readMetadata(result.retrievalMetadata);
  const skipped = readJsonBoolean(metadata?.skipped);
  const skipReason = readJsonString(metadata?.skipReason);
  const retrieverCount = readJsonNumber(metadata?.retrieverCount);
  const fusedCandidateCount = readJsonNumber(metadata?.fusedCandidateCount);

  return {
    ...(result.counts?.retrieved !== undefined ? { retrieved: result.counts.retrieved } : {}),
    ...(skipped !== undefined ? { skipped } : {}),
    ...(skipReason ? { skipReason } : {}),
    ...(retrieverCount !== undefined ? { retrieverCount } : {}),
    ...(fusedCandidateCount !== undefined ? { fusedCandidateCount } : {}),
    ...(result.strategies?.retrieval && result.strategies.retrieval.length > 0
      ? { strategies: result.strategies.retrieval }
      : {}),
  };
}

function toPostRetrieval(result: RuntimeAuditSnapshot): PipelineSnapshotPostRetrieval {
  return {
    ...(result.counts?.selected !== undefined ? { selected: result.counts.selected } : {}),
    ...(result.counts?.dropped !== undefined ? { dropped: result.counts.dropped } : {}),
    ...(result.counts?.finalChunks !== undefined ? { finalChunks: result.counts.finalChunks } : {}),
    ...(result.strategies?.postRetrieval && result.strategies.postRetrieval.length > 0
      ? { strategies: result.strategies.postRetrieval }
      : {}),
  };
}

function toGeneration(
  result: RuntimeResult,
  citationCount: number,
): PipelineSnapshotGeneration {
  const metadata = readMetadata(result.generationMetadata);
  const groundingRefusal = readJsonBoolean(metadata?.groundingRefusal);
  const chunksEmptyReason = readJsonString(metadata?.chunksEmptyReason);
  const policy = readJsonString(metadata?.noGroundingPolicy);

  return {
    citationCount,
    ...(groundingRefusal !== undefined ? { groundingRefusal } : {}),
    ...(chunksEmptyReason ? { chunksEmptyReason } : {}),
    ...(policy === 'explicit' || policy === 'generalize'
      ? { noGroundingPolicy: policy }
      : {}),
    ...(result.strategies?.generation && result.strategies.generation.length > 0
      ? { strategies: result.strategies.generation }
      : {}),
  };
}

function toTimings(result: RuntimeAuditSnapshot): PipelineSnapshotTimings | undefined {
  if (!result.timings) {
    return undefined;
  }

  const next: PipelineSnapshotTimings = {
    ...(result.timings.preRetrieval !== undefined
      ? { preRetrieval: result.timings.preRetrieval }
      : {}),
    ...(result.timings.retrieval !== undefined ? { retrieval: result.timings.retrieval } : {}),
    ...(result.timings.postRetrieval !== undefined
      ? { postRetrieval: result.timings.postRetrieval }
      : {}),
    ...(result.timings.generation !== undefined ? { generation: result.timings.generation } : {}),
    ...(result.timings.total !== undefined ? { total: result.timings.total } : {}),
  };

  return Object.keys(next).length > 0 ? next : undefined;
}

/** 从 runtime 审计快照映射控制台用的四段流水线摘要，不把整份 RAGResponse 暴露给浏览器。 */
export function toPipelineSnapshot(
  result: RuntimeAuditSnapshot,
  options?: { citationCount?: number },
): PipelineSnapshot {
  const traceId = result.traceId ?? result.requestId ?? '';
  const citationCount = options?.citationCount ?? result.citations.length;
  const timings = toTimings(result);

  const snapshot: PipelineSnapshot = {
    traceId,
    preRetrieval: toPreRetrieval(result),
    retrieval: toRetrieval(result),
    postRetrieval: toPostRetrieval(result),
    ...(timings ? { timings } : {}),
  };

  if ('answer' in result) {
    snapshot.generation = toGeneration(result, citationCount);
  }

  return snapshot;
}

/** post-retrieval 实际生效策略名，供 search 响应 appliedFilters 使用。 */
export function appliedPostRetrievalFilters(result: RuntimeAuditSnapshot): string[] {
  return result.strategies?.postRetrieval ?? [];
}
