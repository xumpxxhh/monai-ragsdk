import { describe, expect, it, vi } from 'vitest';

import type { RAGErrorRecord, RAGEvent, RAGTrace } from '@monai-ragsdk/observability';

import {
  IndexingError,
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  runIndexing,
  type Loader,
} from '../src/index.ts';

describe('indexing observer integration', () => {
  it('keeps indexing behavior unchanged when no observer is provided', async () => {
    const loader: Loader = {
      async load() {
        return [{ id: 'doc-1', content: 'hello indexing' }];
      },
    };

    const result = await runIndexing({
      loader,
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder: new MockEmbedder({ dimension: 3 }),
      store: new MemoryVectorStore(),
    });

    expect(result).toMatchObject({
      documentsTotal: 1,
      documentsIndexed: 1,
      failedDocuments: 0,
    });
  });

  it('emits indexing events and trace summaries when an observer is provided', async () => {
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();

    await runIndexing({
      observer: {
        onEvent,
        onTraceEnd,
      },
      trace: {
        traceId: 'trace-1',
        dataset: 'company-handbook',
        version: 'v1',
        tags: {
          app: 'internal-kb',
        },
      },
      loader: {
        async load() {
          return [{ id: 'doc-1', content: 'hello indexing' }];
        },
      },
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder: new MockEmbedder({ dimension: 3 }),
      store: new MemoryVectorStore(),
    });

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ name: 'indexing.run.start' }));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'indexing.load.complete' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'indexing.chunk.complete' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'indexing.embed.complete' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'indexing.store.complete' }),
    );
    expect(onTraceEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-1',
        dataset: 'company-handbook',
        version: 'v1',
        status: 'ok',
      }),
    );
  });

  it('swallows observer failures without breaking runIndexing', async () => {
    const result = await runIndexing({
      observer: {
        async onEvent() {
          throw new Error('observer failed');
        },
      },
      loader: {
        async load() {
          return [{ id: 'doc-1', content: 'hello indexing' }];
        },
      },
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder: new MockEmbedder({ dimension: 3 }),
      store: new MemoryVectorStore(),
    });

    expect(result.documentsIndexed).toBe(1);
  });

  it('records stage failures while preserving existing onError behavior', async () => {
    const onError = vi.fn();
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onRecord = vi.fn<(record: RAGErrorRecord) => Promise<void>>();
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();

    const result = await runIndexing({
      observer: {
        onEvent,
        onError: onRecord,
        onTraceEnd,
      },
      loader: {
        async load() {
          return [{ id: 'doc-fail', content: 'trigger' }];
        },
      },
      chunker: new SimpleChunker({ chunkSize: 20, overlap: 0 }),
      chunkTransformers: [
        {
          async transform() {
            throw new Error('chunk transform failed');
          },
        },
      ],
      embedder: new MockEmbedder({ dimension: 4 }),
      store: new MemoryVectorStore(),
      onError,
    });

    expect(result.failedDocuments).toBe(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'indexing.transform_chunk.fail' }),
    );
    expect(onRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'transform_chunk',
        name: 'indexing.transform_chunk.fail',
      }),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.any(IndexingError),
      expect.objectContaining({ stage: 'transform-chunk' }),
    );
    expect(onTraceEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        errors: expect.arrayContaining([
          expect.objectContaining({ name: 'indexing.transform_chunk.fail' }),
        ]),
      }),
    );
  });

  it('emits indexing.run.fail and trace error status on fatal failures', async () => {
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onRecord = vi.fn<(record: RAGErrorRecord) => Promise<void>>();
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();

    await expect(
      runIndexing({
        observer: {
          onEvent,
          onError: onRecord,
          onTraceEnd,
        },
        loader: {
          async load() {
            return [{ id: 'doc-1', content: 'fatal' }];
          },
        },
        chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
        embedder: {
          async embed() {
            throw new Error('embedding failed');
          },
        },
        store: new MemoryVectorStore(),
      }),
    ).rejects.toBeInstanceOf(IndexingError);

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ name: 'indexing.run.fail' }));
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ name: 'indexing.run.fail' }));
    expect(onTraceEnd).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });
});
