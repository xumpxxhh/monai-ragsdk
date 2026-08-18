import { describe, expect, it } from 'vitest';

import {
  BasicMetadataExtractor,
  ContentCleanupTransformer,
  ContextualHeaderTransformer,
  HashDedupChunkFilter,
  MemoryVectorStore,
  MockEmbedder,
  runIndexing,
} from '../src/index.ts';

describe('indexing extension components', () => {
  it('cleans document content before indexing', async () => {
    const transformer = new ContentCleanupTransformer();
    const document = await transformer.transform({
      id: 'doc-cleanup',
      content: '  first line  \r\n\r\n\r\nsecond line\t\r\n  ',
    });

    expect(document.content).toBe('first line\n\nsecond line');
  });

  it('adds contextual markdown headers to chunk metadata and content', async () => {
    const transformer = new ContextualHeaderTransformer();

    const chunk = await transformer.transform(
      {
        id: 'doc#0',
        content: 'Details',
        metadata: { start: 15, end: 38 },
      },
      {
        document: {
          id: 'doc',
          content: '# Guide\n\n## Setup\n\nDetails',
        },
        mode: 'full',
      },
    );

    expect(chunk.metadata).toMatchObject({
      headerPath: ['Guide', 'Setup'],
    });
    expect(chunk.content).toContain('Context: Guide > Setup');
  });

  it('filters duplicated chunk content', async () => {
    const filter = new HashDedupChunkFilter({ caseSensitive: false });
    const context = {
      document: { id: 'doc-dedup', content: 'ignored' },
      mode: 'full' as const,
    };

    await expect(
      filter.shouldKeep({ id: 'chunk-1', content: 'Same content', metadata: {} }, context),
    ).resolves.toBe(true);
    await expect(
      filter.shouldKeep({ id: 'chunk-2', content: 'same   content', metadata: {} }, context),
    ).resolves.toBe(false);
  });

  it('extracts structured metadata for chunks', async () => {
    const extractor = new BasicMetadataExtractor();
    const metadata = await extractor.extract(
      {
        id: 'chunk-1',
        content: 'content',
        metadata: {
          headerPath: ['Guide', 'Setup'],
        },
      },
      {
        document: {
          id: 'doc-meta',
          content: 'source',
          metadata: { title: 'Metadata Title' },
        },
        mode: 'incremental',
        sourceId: 'source-doc-meta',
        fingerprint: 'fp-doc-meta',
      },
    );

    expect(metadata).toMatchObject({
      chunkId: 'chunk-1',
      chunkLength: 7,
      sourceDocumentId: 'doc-meta',
      indexingMode: 'incremental',
      documentTitle: 'Metadata Title',
      sourceId: 'source-doc-meta',
      fingerprint: 'fp-doc-meta',
      hierarchyPath: ['Guide', 'Setup'],
      hierarchyDepth: 2,
      parentHierarchyPath: ['Guide'],
    });
  });

  it('runs the default extension components together in runIndexing', async () => {
    const store = new MemoryVectorStore();

    const result = await runIndexing({
      loader: {
        async load() {
          return [
            {
              id: 'doc-defaults',
              content: '# Guide\n\n## Setup\n\nAlpha\n\nAlpha  ',
              metadata: {
                title: 'Guide',
                sourceId: 'source-guide',
                fingerprint: 'fp-guide-v1',
              },
            },
          ];
        },
      },
      mode: 'incremental',
      transformers: [new ContentCleanupTransformer()],
      chunker: {
        async chunk() {
          return [
            {
              id: 'doc-defaults#0',
              content: 'Alpha',
              metadata: { start: 0, end: 25 },
            },
            {
              id: 'doc-defaults#1',
              content: 'Alpha',
              metadata: { start: 26, end: 33 },
            },
          ];
        },
      },
      chunkTransformers: [new ContextualHeaderTransformer()],
      chunkFilters: [new HashDedupChunkFilter()],
      metadataExtractors: [new BasicMetadataExtractor()],
      embedder: new MockEmbedder({ dimension: 4 }),
      store,
    });

    expect(result.documentsIndexed).toBe(1);
    expect(result.chunksTotal).toBe(1);
    expect(store.getAll()[0]?.metadata).toMatchObject({
      documentId: 'doc-defaults',
      chunkId: 'doc-defaults#0',
      sourceDocumentId: 'doc-defaults',
      indexingMode: 'incremental',
      documentTitle: 'Guide',
      sourceId: 'source-guide',
      fingerprint: 'fp-guide-v1',
      headerPath: ['Guide', 'Setup'],
      hierarchyPath: ['Guide', 'Setup'],
      hierarchyDepth: 2,
      parentHierarchyPath: ['Guide'],
    });
  });
});
