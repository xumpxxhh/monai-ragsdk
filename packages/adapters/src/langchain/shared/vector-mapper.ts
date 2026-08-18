import type { Chunk, Vector } from '@monai-ragsdk/core';

export const toRagVector = (chunk: Chunk, values: number[]): Vector => {
  return {
    id: chunk.id,
    values,
    metadata: chunk.metadata,
  };
};
