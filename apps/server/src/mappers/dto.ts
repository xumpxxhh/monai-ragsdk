import type { IndexingResult } from '@monai-ragsdk/indexing';
import type { RuntimeResult, RuntimeSearchResult } from '@monai-ragsdk/runtime';

import type {
  Citation,
  CollectionDetail,
  CollectionHealth,
  CollectionSummary,
  IngestStats,
  SearchResult,
  StrategyPreset,
} from '../types/api.js';
import type { CollectionRecord } from '../services/state-store.js';

export const PRESET_LABELS: Record<StrategyPreset, string> = {
  balanced: '均衡',
  high_recall: '高召回',
  low_cost: '低成本',
  strict_cite: '严谨引用',
};

export function emptyIngestStats(): IngestStats {
  return { added: 0, skipped: 0, replaced: 0, failed: 0, cleaned: 0 };
}

/** 把 indexing 计数翻译成控制台「新增 / 跳过 / 替换 / 失败 / 清理」。 */
export function toIngestStats(result: IndexingResult): IngestStats {
  return {
    added: result.documentsIndexed,
    skipped: result.skippedDocuments + result.unchangedDocuments,
    replaced: result.replacedDocuments,
    failed: result.failedDocuments,
    cleaned: result.staleSourcesDeleted,
  };
}

export function snippet(text: string, max = 120): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

export function collectionHealth(record: CollectionRecord): CollectionHealth {
  if (record.documents.length === 0) {
    return 'empty';
  }
  if (record.documents.some((doc) => doc.status === 'failed')) {
    return 'warning';
  }
  return 'healthy';
}

export function toCollectionSummary(record: CollectionRecord): CollectionSummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    documentCount: record.documents.filter((doc) => doc.status !== 'failed').length,
    health: collectionHealth(record),
    presetLabel: PRESET_LABELS[record.strategy.preset],
    failedIngestCount: record.documents.filter((doc) => doc.status === 'failed').length,
    lastIngestAt: record.lastIngest?.finishedAt ?? null,
  };
}

export function toCollectionDetail(record: CollectionRecord): CollectionDetail {
  return {
    ...toCollectionSummary(record),
    createdAt: record.createdAt,
  };
}

export function mapSearchResult(
  result: RuntimeSearchResult,
  query: string,
  topK: number,
): SearchResult {
  const hits = result.chunks.slice(0, topK).map((chunk, index) => {
    const citation = result.citations[index];
    const sourceId =
      citation?.sourceId ??
      (typeof chunk.metadata?.sourceId === 'string' ? chunk.metadata.sourceId : chunk.id);
    const title =
      citation?.title ??
      (typeof chunk.metadata?.documentTitle === 'string'
        ? chunk.metadata.documentTitle
        : typeof chunk.metadata?.title === 'string'
          ? chunk.metadata.title
          : sourceId);

    return {
      rank: index + 1,
      sourceId,
      title,
      score: citation?.score ?? 0,
      snippet: snippet(chunk.content),
    };
  });

  const effectiveQuery = result.effectiveQuery.query;

  return {
    query,
    effectiveQuery: effectiveQuery !== query ? effectiveQuery : undefined,
    hits,
    appliedFilters: [],
  };
}

export function mapCitations(result: RuntimeResult): Citation[] {
  return result.citations.map((citation, index) => {
    const chunk = result.chunks[index];
    return {
      index: citation.index,
      sourceId: citation.sourceId ?? '',
      title: citation.title ?? citation.sourceId ?? '未命名',
      snippet: snippet(chunk?.content ?? citation.originalContent ?? ''),
      score: citation.score ?? 0,
    };
  });
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
} {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}
