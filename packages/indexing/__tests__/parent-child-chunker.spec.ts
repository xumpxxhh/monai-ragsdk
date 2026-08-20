import { describe, expect, it } from 'vitest';

import { BasicMetadataExtractor, ParentChildChunker } from '../src/index.ts';

const sampleMarkdown = `# Guide

${'child content paragraph. '.repeat(8)}

## Setup

${'setup details paragraph. '.repeat(8)}
`;

describe('ParentChildChunker', () => {
  it('emits parent and child chunks with linked metadata', async () => {
    const chunker = new ParentChildChunker({
      childChunkSize: 40,
      childChunkOverlap: 0,
    });

    const chunks = await chunker.chunk({
      id: 'doc-1',
      content: sampleMarkdown,
    });

    const parents = chunks.filter((chunk) => chunk.metadata?.chunkRole === 'parent');
    const children = chunks.filter((chunk) => chunk.metadata?.chunkRole === 'child');

    expect(parents).toHaveLength(2);
    expect(children.length).toBeGreaterThan(parents.length);
    expect(children.every((chunk) => typeof chunk.metadata?.parentChunkId === 'string')).toBe(true);
    expect(children.every((chunk) => chunk.metadata?.headerPath !== undefined)).toBe(true);
  });

  it('can omit parent chunks when includeParents is false', async () => {
    const chunker = new ParentChildChunker({
      includeParents: false,
      childChunkSize: 40,
      childChunkOverlap: 0,
    });

    const chunks = await chunker.chunk({
      id: 'doc-2',
      content: sampleMarkdown,
    });

    expect(chunks.every((chunk) => chunk.metadata?.chunkRole === 'child')).toBe(true);
  });

  it('feeds hierarchy metadata into BasicMetadataExtractor', async () => {
    const chunker = new ParentChildChunker({
      childChunkSize: 40,
      childChunkOverlap: 0,
    });
    const extractor = new BasicMetadataExtractor();

    const chunks = await chunker.chunk({
      id: 'doc-3',
      content: sampleMarkdown,
    });
    const child = chunks.find(
      (chunk) =>
        chunk.metadata?.chunkRole === 'child' &&
        Array.isArray(chunk.metadata?.headerPath) &&
        chunk.metadata.headerPath.join('/') === 'Guide/Setup',
    );

    expect(child).toBeDefined();

    const metadata = await extractor.extract(child!, {
      document: {
        id: 'doc-3',
        content: sampleMarkdown,
      },
      mode: 'full',
    });

    expect(metadata.hierarchyPath).toEqual(['Guide', 'Setup']);
    expect(metadata.hierarchyDepth).toBe(2);
    expect(metadata.parentHierarchyPath).toEqual(['Guide']);
  });
});
