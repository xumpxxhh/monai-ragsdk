import type { Chunk, Document } from "@monai-ragsdk/core";
import type { Chunker } from "@monai-ragsdk/indexing";

import {
  type LangChainDocumentLike,
  toLangChainDocument,
  toRagChunk,
} from "../shared/document-mapper.js";

export type LangChainSemanticChunkerLike = {
  createDocuments?: (
    texts: string[],
    metadatas?: Array<Record<string, unknown>>,
  ) => Promise<LangChainDocumentLike[]>;
  splitDocuments?: (
    documents: LangChainDocumentLike[],
  ) => Promise<LangChainDocumentLike[]>;
};

export type LangChainSemanticChunkerAdapterOptions = {
  chunker: LangChainSemanticChunkerLike;
};

export class LangChainSemanticChunkerAdapter implements Chunker {
  readonly #chunker: LangChainSemanticChunkerLike;

  constructor(options: LangChainSemanticChunkerAdapterOptions) {
    this.#chunker = options.chunker;
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const splitDocuments = await this.#split(document);
    const chunks: Chunk[] = [];

    for (const splitDocument of splitDocuments) {
      const content = splitDocument.pageContent.trim();

      if (content.length === 0) {
        continue;
      }

      chunks.push(
        toRagChunk(
          document,
          {
            id: splitDocument.id,
            pageContent: content,
            metadata: splitDocument.metadata,
          },
          chunks.length,
        ),
      );
    }

    return chunks;
  }

  async #split(document: Document): Promise<LangChainDocumentLike[]> {
    if (this.#chunker.createDocuments) {
      return this.#chunker.createDocuments(
        [document.content],
        [(document.metadata ?? {}) as Record<string, unknown>],
      );
    }

    if (this.#chunker.splitDocuments) {
      return this.#chunker.splitDocuments([toLangChainDocument(document)]);
    }

    throw new Error(
      "LangChain semantic chunker must implement createDocuments() or splitDocuments()",
    );
  }
}
