import type { Chunk, Document } from "@monai-ragsdk/core";

import type { IndexingMode } from "../types/indexing-context.js";

export type ChunkTransformContext = {
  document: Document;
  mode: IndexingMode;
  sourceId?: string;
  fingerprint?: string;
};

export interface ChunkTransformer {
  transform(chunk: Chunk, context: ChunkTransformContext): Promise<Chunk>;
}
