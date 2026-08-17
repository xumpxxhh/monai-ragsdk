import type { Chunk } from "@monai-ragsdk/core";
import type { Embedder } from "@monai-ragsdk/indexing";

import { toRagVector } from "../shared/vector-mapper.js";

export type LangChainEmbeddingsLike = {
  embedDocuments(texts: string[]): Promise<number[][]>;
};

export type LangChainEmbeddingsAdapterOptions = {
  embeddings: LangChainEmbeddingsLike;
};

export class LangChainEmbeddingsAdapter implements Embedder {
  readonly #embeddings: LangChainEmbeddingsLike;

  constructor(options: LangChainEmbeddingsAdapterOptions) {
    this.#embeddings = options.embeddings;
  }

  async embed(chunks: Chunk[]) {
    if (chunks.length === 0) {
      return [];
    }

    const vectors = await this.#embeddings.embedDocuments(
      chunks.map((chunk) => chunk.content),
    );

    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding result count mismatch: expected ${chunks.length}, received ${vectors.length}`,
      );
    }

    return chunks.map((chunk, index) => toRagVector(chunk, vectors[index] ?? []));
  }
}