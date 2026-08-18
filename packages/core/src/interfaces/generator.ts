import type { Chunk, Query } from '../types/index.js';

export interface Generator {
  generate(input: { query: Query; chunks: Chunk[] }): Promise<string>;
}
