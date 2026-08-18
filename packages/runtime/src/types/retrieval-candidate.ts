import type { Chunk, JsonValue } from '@monai-ragsdk/core';

export type RetrievalCandidate = {
  chunk: Chunk;
  score?: number;
  route?: string;
  strategy?: string;
  sourceId?: string;
  fingerprint?: string;
  hierarchyPath?: string;
  parentHierarchyPath?: string;
  hierarchyDepth?: number;
  matchedFilters?: string[];
  retrieverMetadata?: Record<string, JsonValue>;
  /** 压缩是否改写了 chunk.content；原文在 originalContent。 */
  compressed?: boolean;
  /** 进入压缩前的正文；未压缩时不写。 */
  originalContent?: string;
};
