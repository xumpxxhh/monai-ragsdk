import type { Vector } from "@monai-ragsdk/core";

import type { IndexingMode } from "../types/indexing-context.js";

export type VectorStoreWriteContext = {
  documentId?: string;
  chunkIds?: string[];
  mode?: IndexingMode;
  sourceId?: string;
  fingerprint?: string;
};

export type VectorStoreDeleteFilter = {
  sourceIds?: string[];
  fingerprints?: string[];
};

export interface VectorStore {
  upsert(vectors: Vector[], context?: VectorStoreWriteContext): Promise<void>;
  deleteByFilter?(filter: VectorStoreDeleteFilter): Promise<void>;
}
