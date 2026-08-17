import type { Chunk, Document } from "@monai-ragsdk/core";

import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
} from "../defaults/index.js";
import type { Chunker } from "./chunker.js";

export type SimpleChunkerOptions = {
  chunkSize?: number;
  overlap?: number;
};

export class SimpleChunker implements Chunker {
  readonly #chunkSize: number;
  readonly #overlap: number;

  constructor(options: SimpleChunkerOptions = {}) {
    this.#chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.#overlap = options.overlap ?? DEFAULT_CHUNK_OVERLAP;

    if (this.#chunkSize <= 0) {
      throw new Error("chunkSize must be greater than 0");
    }

    if (this.#overlap < 0) {
      throw new Error("overlap must be greater than or equal to 0");
    }

    if (this.#overlap >= this.#chunkSize) {
      throw new Error("overlap must be smaller than chunkSize");
    }
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const content = document.content.trim();

    if (content.length === 0) {
      return [];
    }

    const chunks: Chunk[] = [];
    const step = this.#chunkSize - this.#overlap;

    for (let start = 0; start < content.length; start += step) {
      const end = Math.min(start + this.#chunkSize, content.length);
      const chunkContent = content.slice(start, end).trim();

      if (chunkContent.length === 0) {
        continue;
      }

      const chunkIndex = chunks.length;

      chunks.push({
        id: `${document.id}#${chunkIndex}`,
        content: chunkContent,
        metadata: {
          chunkIndex,
          start,
          end,
        },
      });
    }

    return chunks;
  }
}
