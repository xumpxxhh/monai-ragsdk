import type { Chunk, JsonValue } from '@monai-ragsdk/core';

import type {
  RetrievalCandidate,
  RetrievalFilters,
  RetrievalRequest,
  RetrievalScoreKind,
  RuntimeRetrievalResult,
} from '../types/index.js';

export type IndexingRetrievalFilterInput = {
  sourceIds?: string[];
  fingerprints?: string[];
  hierarchyPaths?: string[];
  parentHierarchyPaths?: string[];
  hierarchyPath?: string | string[];
  parentHierarchyPath?: string | string[];
  minHierarchyDepth?: number;
  maxHierarchyDepth?: number;
  metadata?: Record<string, JsonValue>;
};

export type CreateIndexingRetrievalRequestOptions = Omit<RetrievalRequest, 'filters'> & {
  filters?: IndexingRetrievalFilterInput | RetrievalFilters;
};

export type CreateIndexingRetrievalCandidateOptions = {
  score?: number;
  scoreKind?: RetrievalScoreKind;
  route?: string;
  strategy?: string;
  retrieverMetadata?: Record<string, JsonValue>;
  filters?: RetrievalFilters;
};

export type RetrievalFilterMatchResult = {
  matched: boolean;
  matchedFilters: string[];
};

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return (
    value !== undefined && value !== null && !Array.isArray(value) && typeof value === 'object'
  );
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function readNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function serializePath(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const segments = value.filter(
    (segment): segment is string => typeof segment === 'string' && segment.length > 0,
  );

  return segments.length > 0 ? segments.join('/') : undefined;
}

function normalizeArray(values: Array<string | undefined>): string[] | undefined {
  const normalized = Array.from(
    new Set(
      values.filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  return normalized.length > 0 ? normalized : undefined;
}

function jsonEquals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) {
    return true;
  }

  if (left === undefined || right === undefined || left === null || right === null) {
    return left === right;
  }

  if (typeof left !== typeof right) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    if (left.length !== right.length) {
      return false;
    }

    return left.every((entry, index) => jsonEquals(entry, right[index]));
  }

  if (typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonEquals(left[key], right[key]),
    );
  }

  return false;
}

export function createIndexingRetrievalFilters(
  input: IndexingRetrievalFilterInput | RetrievalFilters | undefined,
): RetrievalFilters | undefined {
  if (!input) {
    return undefined;
  }

  const hierarchyPath = serializePath('hierarchyPath' in input ? input.hierarchyPath : undefined);
  const parentHierarchyPath = serializePath(
    'parentHierarchyPath' in input ? input.parentHierarchyPath : undefined,
  );

  const filters: RetrievalFilters = {
    sourceIds: normalizeArray(input.sourceIds ?? []),
    fingerprints: normalizeArray(input.fingerprints ?? []),
    hierarchyPaths: normalizeArray([...(input.hierarchyPaths ?? []), hierarchyPath]),
    parentHierarchyPaths: normalizeArray([
      ...(input.parentHierarchyPaths ?? []),
      parentHierarchyPath,
    ]),
    minHierarchyDepth: input.minHierarchyDepth,
    maxHierarchyDepth: input.maxHierarchyDepth,
    metadata: input.metadata,
  };

  if (
    !filters.sourceIds &&
    !filters.fingerprints &&
    !filters.hierarchyPaths &&
    !filters.parentHierarchyPaths &&
    filters.minHierarchyDepth === undefined &&
    filters.maxHierarchyDepth === undefined &&
    filters.metadata === undefined
  ) {
    return undefined;
  }

  return filters;
}

export function createIndexingRetrievalRequest(
  options: CreateIndexingRetrievalRequestOptions,
): RetrievalRequest {
  return {
    ...options,
    filters: createIndexingRetrievalFilters(options.filters),
  };
}

export function createIndexingRetrievalCandidate(
  chunk: Chunk,
  options: CreateIndexingRetrievalCandidateOptions = {},
): RetrievalCandidate {
  const metadata = isRecord(chunk.metadata) ? chunk.metadata : undefined;
  const hierarchyPathSegments = readStringArray(metadata?.hierarchyPath);
  const parentHierarchyPathSegments = readStringArray(metadata?.parentHierarchyPath);
  const hierarchyPath = serializePath(hierarchyPathSegments);
  const parentHierarchyPath = serializePath(parentHierarchyPathSegments);
  const fallbackHierarchyDepth =
    hierarchyPathSegments.length > 0 ? hierarchyPathSegments.length : undefined;
  const hierarchyDepth = readNumber(metadata?.hierarchyDepth) ?? fallbackHierarchyDepth;

  const candidate: RetrievalCandidate = {
    chunk,
    score: options.score,
    scoreKind: options.scoreKind,
    route: options.route,
    strategy: options.strategy,
    sourceId: readString(metadata?.sourceId),
    fingerprint: readString(metadata?.fingerprint),
    hierarchyPath,
    parentHierarchyPath,
    hierarchyDepth,
    retrieverMetadata: options.retrieverMetadata,
  };

  if (options.filters) {
    const match = matchRetrievalCandidateFilters(candidate, options.filters);
    candidate.matchedFilters = match.matchedFilters;
  }

  return candidate;
}

export function matchRetrievalCandidateFilters(
  candidate: RetrievalCandidate,
  filters: RetrievalFilters | undefined,
): RetrievalFilterMatchResult {
  if (!filters) {
    return {
      matched: true,
      matchedFilters: [],
    };
  }

  const matchedFilters: string[] = [];

  if (filters.sourceIds) {
    if (!candidate.sourceId || !filters.sourceIds.includes(candidate.sourceId)) {
      return { matched: false, matchedFilters };
    }

    matchedFilters.push('sourceIds');
  }

  if (filters.fingerprints) {
    if (!candidate.fingerprint || !filters.fingerprints.includes(candidate.fingerprint)) {
      return { matched: false, matchedFilters };
    }

    matchedFilters.push('fingerprints');
  }

  if (filters.hierarchyPaths) {
    if (!candidate.hierarchyPath || !filters.hierarchyPaths.includes(candidate.hierarchyPath)) {
      return { matched: false, matchedFilters };
    }

    matchedFilters.push('hierarchyPaths');
  }

  if (filters.parentHierarchyPaths) {
    if (
      !candidate.parentHierarchyPath ||
      !filters.parentHierarchyPaths.includes(candidate.parentHierarchyPath)
    ) {
      return { matched: false, matchedFilters };
    }

    matchedFilters.push('parentHierarchyPaths');
  }

  if (filters.minHierarchyDepth !== undefined) {
    if (
      candidate.hierarchyDepth === undefined ||
      candidate.hierarchyDepth < filters.minHierarchyDepth
    ) {
      return { matched: false, matchedFilters };
    }

    matchedFilters.push('minHierarchyDepth');
  }

  if (filters.maxHierarchyDepth !== undefined) {
    if (
      candidate.hierarchyDepth === undefined ||
      candidate.hierarchyDepth > filters.maxHierarchyDepth
    ) {
      return { matched: false, matchedFilters };
    }

    matchedFilters.push('maxHierarchyDepth');
  }

  if (filters.metadata) {
    const metadata = isRecord(candidate.chunk.metadata) ? candidate.chunk.metadata : undefined;

    for (const [key, expectedValue] of Object.entries(filters.metadata)) {
      if (!jsonEquals(metadata?.[key], expectedValue)) {
        return { matched: false, matchedFilters };
      }
    }

    matchedFilters.push('metadata');
  }

  return {
    matched: true,
    matchedFilters,
  };
}

export function filterRetrievalCandidatesByIndexingFilters(
  candidates: RetrievalCandidate[],
  filters: RetrievalFilters | undefined,
): RetrievalCandidate[] {
  return candidates.flatMap((candidate) => {
    const match = matchRetrievalCandidateFilters(candidate, filters);

    if (!match.matched) {
      return [];
    }

    return [
      {
        ...candidate,
        matchedFilters: match.matchedFilters,
      },
    ];
  });
}

/**
 * runtime 编排层强制点：adapter 可以预过滤，但不能关掉租户/来源隔离。
 * 已符合 filters 的结果再跑一遍是幂等的；只有真正丢候选时才改 metadata，避免污染未过滤请求的审计。
 */
export function enforceRetrievalRequestFilters(
  result: RuntimeRetrievalResult,
  filters: RetrievalFilters | undefined,
): RuntimeRetrievalResult {
  if (!filters) {
    return result;
  }

  const candidates = filterRetrievalCandidatesByIndexingFilters(result.candidates, filters);
  const unchanged =
    candidates.length === result.candidates.length &&
    candidates.every((candidate, index) => candidate.chunk.id === result.candidates[index]?.chunk.id);

  if (unchanged) {
    return {
      ...result,
      candidates,
    };
  }

  return {
    candidates,
    retrievalMetadata: {
      ...result.retrievalMetadata,
      requestFiltersEnforced: true,
      candidateCountBeforeRequestFilters: result.candidates.length,
    },
  };
}

