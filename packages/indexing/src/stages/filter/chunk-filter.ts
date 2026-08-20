import type { Chunk, Document } from '@monai-ragsdk/core';

import type { IndexingMode } from '../../types/indexing-context.js';

export type ChunkFilterContext = {
  document: Document;
  mode: IndexingMode;
  sourceId?: string;
  fingerprint?: string;
};

export interface ChunkFilter {
  shouldKeep(chunk: Chunk, context: ChunkFilterContext): Promise<boolean>;
}
