import type { JsonValue } from "@monai-ragsdk/core";

export type RetrievalFilters = {
  sourceIds?: string[];
  fingerprints?: string[];
  hierarchyPaths?: string[];
  parentHierarchyPaths?: string[];
  minHierarchyDepth?: number;
  maxHierarchyDepth?: number;
  metadata?: Record<string, JsonValue>;
};
