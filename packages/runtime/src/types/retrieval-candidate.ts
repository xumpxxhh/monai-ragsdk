import type { Chunk, JsonValue } from "@monai-ragsdk/core";

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
};
