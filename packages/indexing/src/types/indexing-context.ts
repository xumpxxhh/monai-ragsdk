export type IndexingMode = "full" | "incremental";

export type IndexingStage =
  | "load"
  | "transform"
  | "filter"
  | "chunk"
  | "metadata"
  | "transform-chunk"
  | "extract-metadata"
  | "filter-chunk"
  | "embed"
  | "store"
  | "delete";

export type IndexingContext = {
  documentId?: string;
  chunkId?: string;
  mode?: IndexingMode;
  sourceId?: string;
  fingerprint?: string;
  stage: IndexingStage;
};
