import type { Chunk, Document } from '@monai-ragsdk/core';

export interface Chunker {
  chunk(document: Document): Promise<Chunk[]>;
}
