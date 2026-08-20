import type { Chunk, Vector } from '@monai-ragsdk/core';

export interface Embedder {
  embed(chunks: Chunk[]): Promise<Vector[]>;
}
