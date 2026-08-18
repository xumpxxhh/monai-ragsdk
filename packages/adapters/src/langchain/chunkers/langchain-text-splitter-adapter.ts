import type { TextSplitter } from '@langchain/textsplitters';
import type { Chunker } from '@monai-ragsdk/indexing';
import type { Chunk, Document } from '@monai-ragsdk/core';

import { toLangChainDocument, toRagChunk } from '../shared/document-mapper.js';

export type LangChainTextSplitterAdapterOptions = {
  splitter: Pick<TextSplitter, 'splitDocuments'>;
};

export class LangChainTextSplitterAdapter implements Chunker {
  readonly #splitter: Pick<TextSplitter, 'splitDocuments'>;

  constructor(options: LangChainTextSplitterAdapterOptions) {
    this.#splitter = options.splitter;
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const splitDocuments = await this.#splitter.splitDocuments([toLangChainDocument(document)]);

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
}
