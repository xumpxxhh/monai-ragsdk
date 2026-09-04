import type { JsonValue } from '@monai-ragsdk/core';
import {
  resolveGenerationGrounding,
  type RetrievalScoreKind,
  type RuntimeSearchResult,
} from '@monai-ragsdk/runtime';

import type { KnowledgeSearchHit, KnowledgeSearchResult } from '../types.js';

function readMetadataString(metadata: Record<string, JsonValue> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * 审计快照未暴露 per-hit scoreKind，按策略与 retrievalMetadata 做保守推断。
 */
function inferScoreKind(
  result: RuntimeSearchResult,
  strategyNames: string[] | undefined,
): RetrievalScoreKind | undefined {
  const post = strategyNames ?? result.strategies?.postRetrieval ?? [];
  if (post.some((name) => name.includes('llm-rerank') || name === 'llm-rerank')) {
    return 'llm';
  }

  const metadata = result.retrievalMetadata as Record<string, unknown> | undefined;
  if (metadata?.provider === 'fan-out' || metadata?.fusedCandidateCount !== undefined) {
    return 'rrf';
  }

  return 'retriever';
}

function resolveGrounding(result: RuntimeSearchResult) {
  if (result.chunks.length > 0) {
    return { empty: false as const };
  }

  const retrievedCount = result.counts?.retrieved ?? result.retrievedCandidates?.length ?? 0;
  const retrievalSkipped =
    result.retrievalMetadata?.skipped === true ||
    (typeof result.retrievalMetadata?.skipReason === 'string' &&
      result.retrievalMetadata.skipReason.length > 0);

  const grounding = resolveGenerationGrounding({
    retrievedCount,
    chunkCount: 0,
    retrievalSkipped,
  });

  return {
    empty: true as const,
    chunksEmptyReason: grounding?.chunksEmptyReason,
  };
}

/**
 * 把 runtime.search 结果映射为 Agent 可用的 knowledge 响应：全文 content，不带 pipeline / observer。
 */
export function mapKnowledgeSearchResult(
  result: RuntimeSearchResult,
  query: string,
  topK: number,
  defaultCollectionId?: string,
): KnowledgeSearchResult {
  const effectiveQuery = result.effectiveQuery.query;
  const traceId = result.traceId ?? result.requestId ?? '';
  const scoreKindHint = inferScoreKind(result, result.strategies?.postRetrieval);

  const hits: KnowledgeSearchHit[] = result.chunks.slice(0, topK).map((chunk, index) => {
    const citation = result.citations[index];
    const metadata =
      chunk.metadata && typeof chunk.metadata === 'object' && !Array.isArray(chunk.metadata)
        ? (chunk.metadata as Record<string, JsonValue>)
        : undefined;
    const sourceId =
      citation?.sourceId ?? readMetadataString(metadata, 'sourceId') ?? chunk.id;
    const title =
      citation?.title ??
      readMetadataString(metadata, 'documentTitle') ??
      readMetadataString(metadata, 'title') ??
      sourceId;
    const collectionId =
      defaultCollectionId ?? readMetadataString(metadata, 'collectionId');

    return {
      rank: index + 1,
      ...(collectionId ? { collectionId } : {}),
      sourceId,
      title,
      content: chunk.content,
      score: citation?.score ?? 0,
      ...(scoreKindHint ? { scoreKind: scoreKindHint } : {}),
    };
  });

  return {
    query,
    effectiveQuery: effectiveQuery !== query ? effectiveQuery : undefined,
    traceId,
    hits,
    grounding: resolveGrounding(result),
  };
}
