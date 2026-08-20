import type { Chunk, Document } from '@monai-ragsdk/core';

import { SimpleChunker } from './simple-chunker.js';
import type { Chunker } from './chunker.js';

export type HeadingSection = {
  headerPath: string[];
  content: string;
  sectionIndex: number;
};

export type HeadingBasedChunkerOptions = {
  maxHeadingLevel?: number;
  maxSectionSize?: number;
  includeHeadingInContent?: boolean;
  sectionChunker?: Chunker;
};

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/;

/** 按 Markdown 标题切 section；过长 section 可二次切分。 */
export function splitDocumentByHeadings(
  document: Document,
  options: HeadingBasedChunkerOptions = {},
): HeadingSection[] {
  const maxHeadingLevel = options.maxHeadingLevel ?? 6;
  const includeHeadingInContent = options.includeHeadingInContent ?? true;
  const lines = document.content.replace(/\r\n/g, '\n').split('\n');
  const sections: HeadingSection[] = [];
  const headerStack: string[] = [];
  let currentLines: string[] = [];
  let sectionIndex = 0;

  const flushSection = () => {
    const body = currentLines.join('\n').trim();

    if (body.length === 0 && sections.length === 0 && headerStack.length === 0) {
      return;
    }

    if (body.length === 0) {
      currentLines = [];
      return;
    }

    sections.push({
      headerPath: [...headerStack],
      content: body,
      sectionIndex,
    });
    sectionIndex += 1;
    currentLines = [];
  };

  for (const line of lines) {
    const match = HEADING_PATTERN.exec(line.trim());

    if (match) {
      const level = match[1].length;

      if (level <= maxHeadingLevel) {
        flushSection();
        headerStack.splice(level - 1);
        headerStack[level - 1] = match[2].trim();
        headerStack.length = level;

        if (includeHeadingInContent) {
          currentLines.push(line.trim());
        }

        continue;
      }
    }

    currentLines.push(line);
  }

  flushSection();

  if (sections.length === 0 && document.content.trim().length > 0) {
    sections.push({
      headerPath: [],
      content: document.content.trim(),
      sectionIndex: 0,
    });
  }

  return sections;
}

export class HeadingBasedChunker implements Chunker {
  readonly #options: HeadingBasedChunkerOptions;

  constructor(options: HeadingBasedChunkerOptions = {}) {
    this.#options = options;
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const sections = splitDocumentByHeadings(document, this.#options);
    const chunks: Chunk[] = [];

    for (const section of sections) {
      const baseMetadata = {
        ...(document.metadata ?? {}),
        headerPath: section.headerPath,
        sectionIndex: section.sectionIndex,
      };

      if (
        this.#options.maxSectionSize !== undefined &&
        section.content.length > this.#options.maxSectionSize
      ) {
        const sectionChunker =
          this.#options.sectionChunker ??
          new SimpleChunker({
            chunkSize: this.#options.maxSectionSize,
            overlap: 0,
          });
        const sectionDocument: Document = {
          id: `${document.id}#section-${section.sectionIndex}`,
          content: section.content,
          metadata: baseMetadata,
        };
        const sectionChunks = await sectionChunker.chunk(sectionDocument);

        for (const [chunkIndex, chunk] of sectionChunks.entries()) {
          chunks.push({
            ...chunk,
            id: `${document.id}#section-${section.sectionIndex}-${chunkIndex}`,
            metadata: {
              ...(chunk.metadata ?? {}),
              headerPath: section.headerPath,
              sectionIndex: section.sectionIndex,
              chunkIndex,
            },
          });
        }

        continue;
      }

      chunks.push({
        id: `${document.id}#section-${section.sectionIndex}`,
        content: section.content,
        metadata: {
          ...baseMetadata,
          chunkIndex: 0,
        },
      });
    }

    return chunks;
  }
}
