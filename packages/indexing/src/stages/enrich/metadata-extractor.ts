import type { Chunk, Document, JsonValue } from '@monai-ragsdk/core';

import type { IndexingMode } from '../../types/indexing-context.js';

export type MetadataExtractionContext = {
  document: Document;
  mode: IndexingMode;
  sourceId?: string;
  fingerprint?: string;
};

export interface MetadataExtractor {
  extract(
    chunk: Chunk,
    context: MetadataExtractionContext,
  ): Promise<Record<string, JsonValue> | undefined>;
}
