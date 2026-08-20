import type { Chunk, Document } from '@monai-ragsdk/core';

import type { Chunker } from './chunker.js';
import { splitDocumentByHeadings } from './heading-based-chunker.js';
import { SimpleChunker } from './simple-chunker.js';

export type ParentChildChunkerOptions = {
  childChunker?: Chunker;
  includeParents?: boolean;
  maxHeadingLevel?: number;
  includeHeadingInContent?: boolean;
  childChunkSize?: number;
  childChunkOverlap?: number;
};

/** 按标题生成 parent section，并在 section 内生成 child 小块。 */
export class ParentChildChunker implements Chunker {
  readonly #childChunker: Chunker;
  readonly #includeParents: boolean;
  readonly #headingOptions: Pick<
    ParentChildChunkerOptions,
    'maxHeadingLevel' | 'includeHeadingInContent'
  >;

  constructor(options: ParentChildChunkerOptions = {}) {
    this.#childChunker =
      options.childChunker ??
      new SimpleChunker({
        chunkSize: options.childChunkSize ?? 200,
        overlap: options.childChunkOverlap ?? 20,
      });
    this.#includeParents = options.includeParents ?? true;
    this.#headingOptions = {
      maxHeadingLevel: options.maxHeadingLevel,
      includeHeadingInContent: options.includeHeadingInContent,
    };
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const sections = splitDocumentByHeadings(document, this.#headingOptions);
    const chunks: Chunk[] = [];

    for (const section of sections) {
      const parentId = `${document.id}#parent-${section.sectionIndex}`;
      const parentChunk: Chunk = {
        id: parentId,
        content: section.content,
        metadata: {
          ...(document.metadata ?? {}),
          chunkRole: 'parent',
          headerPath: section.headerPath,
          sectionIndex: section.sectionIndex,
          chunkIndex: section.sectionIndex,
        },
      };

      if (this.#includeParents) {
        chunks.push(parentChunk);
      }

      const childDocument: Document = {
        id: parentId,
        content: section.content,
        metadata: parentChunk.metadata,
      };
      const childChunks = await this.#childChunker.chunk(childDocument);

      for (const [childIndex, childChunk] of childChunks.entries()) {
        chunks.push({
          ...childChunk,
          id: `${parentId}#child-${childIndex}`,
          metadata: {
            ...(childChunk.metadata ?? {}),
            chunkRole: 'child',
            parentChunkId: parentId,
            headerPath: section.headerPath,
            sectionIndex: section.sectionIndex,
            chunkIndex: childIndex,
          },
        });
      }
    }

    return chunks;
  }
}
