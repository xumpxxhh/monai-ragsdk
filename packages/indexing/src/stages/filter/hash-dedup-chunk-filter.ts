import type { Chunk } from '@monai-ragsdk/core';

import type { ChunkFilter, ChunkFilterContext } from './chunk-filter.js';

export type HashDedupChunkFilterOptions = {
  caseSensitive?: boolean;
  collapseWhitespace?: boolean;
};

export class HashDedupChunkFilter implements ChunkFilter {
  readonly #caseSensitive: boolean;
  readonly #collapseWhitespace: boolean;
  readonly #seenHashes = new Set<string>();

  constructor(options: HashDedupChunkFilterOptions = {}) {
    this.#caseSensitive = options.caseSensitive ?? true;
    this.#collapseWhitespace = options.collapseWhitespace ?? true;
  }

  async shouldKeep(chunk: Chunk, _context: ChunkFilterContext): Promise<boolean> {
    const normalizedContent = this.#normalize(chunk.content);

    if (normalizedContent.length === 0) {
      return false;
    }

    const hash = this.#hash(normalizedContent);

    if (this.#seenHashes.has(hash)) {
      return false;
    }

    this.#seenHashes.add(hash);
    return true;
  }

  #normalize(content: string): string {
    let normalizedContent = content.trim();

    if (this.#collapseWhitespace) {
      normalizedContent = normalizedContent.replace(/\s+/g, ' ');
    }

    if (!this.#caseSensitive) {
      normalizedContent = normalizedContent.toLowerCase();
    }

    return normalizedContent;
  }

  #hash(content: string): string {
    let hash = 5381;

    for (let index = 0; index < content.length; index += 1) {
      hash = (hash * 33) ^ content.charCodeAt(index);
    }

    return String(hash >>> 0);
  }
}
