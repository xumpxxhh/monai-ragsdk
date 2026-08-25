import type { RetrievalObservation } from '@monai-ragsdk/eval';
import type { RuntimeResult, RuntimeSearchResult } from '@monai-ragsdk/runtime';

type RuntimeAuditSnapshot = RuntimeSearchResult | RuntimeResult;

function readString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function resolveSourceId(
  chunkId: string,
  citation: { sourceId?: string } | undefined,
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readString(citation?.sourceId) ??
    readString(metadata?.sourceId) ??
    readString(metadata?.source)
  );
}

/**
 * 把 runtime 审计快照映射为 eval 中性观测结构。
 * retrieved 保 retrievedCandidates 顺序；selected 保 post-retrieval chunks 顺序。
 */
export function toRetrievalObservation(result: RuntimeAuditSnapshot): RetrievalObservation {
  const citationByChunkId = new Map(result.citations.map((citation) => [citation.chunkId, citation]));

  const retrieved = (result.retrievedCandidates ?? []).map((candidate, index) => ({
    chunkId: candidate.chunkId,
    rank: index + 1,
    ...(candidate.sourceId ? { sourceId: candidate.sourceId } : {}),
    ...(candidate.score !== undefined ? { score: candidate.score } : {}),
  }));

  const selected = result.chunks.map((chunk) => {
    const citation = citationByChunkId.get(chunk.id);
    const metadata =
      chunk.metadata && typeof chunk.metadata === 'object'
        ? (chunk.metadata as Record<string, unknown>)
        : undefined;
    const sourceId = resolveSourceId(chunk.id, citation, metadata);

    return {
      chunkId: chunk.id,
      ...(sourceId ? { sourceId } : {}),
    };
  });

  return { retrieved, selected };
}
