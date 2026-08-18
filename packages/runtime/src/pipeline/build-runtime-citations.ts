import type { JsonValue } from '@monai-ragsdk/core';

import type { PostRetrievalResult, RetrievalCandidate, RuntimeCitation } from '../types/index.js';

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return (
    value !== undefined && value !== null && !Array.isArray(value) && typeof value === 'object'
  );
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readHierarchyPath(metadata: Record<string, JsonValue> | undefined): string | undefined {
  const value = metadata?.hierarchyPath;

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const segments = value.filter(
    (segment): segment is string => typeof segment === 'string' && segment.length > 0,
  );

  return segments.length > 0 ? segments.join('/') : undefined;
}

/**
 * 从 post-retrieval 选出的 chunks 生成 citations。
 * 检索为空时返回 []，保证 run() / runStream() / search() 引用形状一致；
 * selectedCandidates 只用来补 score / sourceId，不以它替代 chunks 顺序。
 */
export function buildRuntimeCitations(postResult: PostRetrievalResult): RuntimeCitation[] {
  const candidatesByChunkId = new Map<string, RetrievalCandidate>();

  for (const candidate of postResult.selectedCandidates ?? []) {
    candidatesByChunkId.set(candidate.chunk.id, candidate);
  }

  return postResult.chunks.map((chunk, offset) => {
    const candidate = candidatesByChunkId.get(chunk.id);
    const metadata = isRecord(chunk.metadata) ? chunk.metadata : undefined;
    const citation: RuntimeCitation = {
      index: offset + 1,
      chunkId: chunk.id,
    };
    const sourceId = candidate?.sourceId ?? readString(metadata?.sourceId);
    const title = readString(metadata?.documentTitle) ?? readString(metadata?.title);
    const hierarchyPath = candidate?.hierarchyPath ?? readHierarchyPath(metadata);

    if (sourceId) {
      citation.sourceId = sourceId;
    }

    if (candidate?.score !== undefined) {
      citation.score = candidate.score;
    }

    if (title) {
      citation.title = title;
    }

    if (hierarchyPath) {
      citation.hierarchyPath = hierarchyPath;
    }

    if (candidate?.compressed) {
      citation.compressed = true;
    }

    if (typeof candidate?.originalContent === 'string' && candidate.originalContent.length > 0) {
      citation.originalContent = candidate.originalContent;
    }

    return citation;
  });
}
