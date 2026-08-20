import type { Chunk, Vector } from '@monai-ragsdk/core';

import { DEFAULT_VECTOR_DIMENSION } from './defaults.js';
import type { Embedder } from './embedder.js';

export type MockEmbedderOptions = {
  dimension?: number;
};

export class MockEmbedder implements Embedder {
  readonly #dimension: number;

  constructor(options: MockEmbedderOptions = {}) {
    this.#dimension = options.dimension ?? DEFAULT_VECTOR_DIMENSION;

    if (this.#dimension <= 0) {
      throw new Error('dimension must be greater than 0');
    }
  }

  async embed(chunks: Chunk[]): Promise<Vector[]> {
    return chunks.map((chunk) => ({
      id: chunk.id,
      values: this.#buildValues(chunk.content),
      metadata: chunk.metadata,
    }));
  }

  #buildValues(content: string): number[] {
    const values = Array.from({ length: this.#dimension }, () => 0);

    for (let index = 0; index < content.length; index += 1) {
      values[index % this.#dimension] += content.charCodeAt(index);
    }

    return values.map((value, index) => Number(((value % 997) / (index + 1 || 1)).toFixed(6)));
  }
}
