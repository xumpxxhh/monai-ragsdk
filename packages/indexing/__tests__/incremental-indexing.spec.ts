import { describe, expect, it, vi } from 'vitest';

import {
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  runIndexing,
  type Embedder,
  type Loader,
  type VectorStore,
} from '../src/index.ts';

function createSourceLoader(
  documents: Array<{
    id: string;
    content: string;
    sourceId: string;
    fingerprint: string;
  }>,
): Loader {
  return {
    async load() {
      return documents.map((document) => ({
        id: document.id,
        content: document.content,
        metadata: {
          sourceId: document.sourceId,
          fingerprint: document.fingerprint,
        },
      }));
    },
  };
}

describe('runIndexing incremental behavior', () => {
  it('skips embed and upsert when fingerprint is unchanged', async () => {
    const store = new MemoryVectorStore();
    const embed = vi.fn(async (chunks) => new MockEmbedder({ dimension: 4 }).embed(chunks));
    const embedder: Embedder = { embed };
    const loader = createSourceLoader([
      {
        id: 'doc-1',
        content: 'stable document',
        sourceId: 'source-a',
        fingerprint: 'fp-1',
      },
    ]);

    const first = await runIndexing({
      loader,
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder,
      store,
      mode: 'incremental',
    });

    const second = await runIndexing({
      loader,
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder,
      store,
      mode: 'incremental',
    });

    expect(first.documentsIndexed).toBe(1);
    expect(first.unchangedDocuments).toBe(0);
    expect(second.documentsIndexed).toBe(0);
    expect(second.unchangedDocuments).toBe(1);
    expect(second.vectorsTotal).toBe(0);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(store.size()).toBe(first.vectorsTotal);
  });

  it('replaces when the same source already has multiple fingerprints', async () => {
    const store = new MemoryVectorStore();
    const embed = vi.fn(async (chunks) => new MockEmbedder({ dimension: 4 }).embed(chunks));
    const embedder: Embedder = { embed };

    await store.upsert([
      {
        id: 'old-1',
        values: [0, 0, 0, 1],
        metadata: { sourceId: 'source-a', fingerprint: 'fp-old' },
      },
      {
        id: 'old-2',
        values: [0, 0, 1, 0],
        metadata: { sourceId: 'source-a', fingerprint: 'fp-1' },
      },
    ]);

    const result = await runIndexing({
      loader: createSourceLoader([
        {
          id: 'doc-1',
          content: 'stable document',
          sourceId: 'source-a',
          fingerprint: 'fp-1',
        },
      ]),
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder,
      store,
      mode: 'incremental',
    });

    expect(result.unchangedDocuments).toBe(0);
    expect(result.replacedDocuments).toBe(1);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(store.getAll().every((vector) => vector.metadata?.fingerprint === 'fp-1')).toBe(true);
  });

  it('replaces previous vectors when fingerprint changes', async () => {
    const store = new MemoryVectorStore();
    const embedder = new MockEmbedder({ dimension: 4 });

    await runIndexing({
      loader: createSourceLoader([
        {
          id: 'doc-1',
          content: 'version one',
          sourceId: 'source-a',
          fingerprint: 'fp-1',
        },
      ]),
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder,
      store,
      mode: 'incremental',
    });

    const firstIds = store.getAll().map((vector) => vector.id);

    const result = await runIndexing({
      loader: createSourceLoader([
        {
          id: 'doc-1',
          content: 'version two is longer and should reindex',
          sourceId: 'source-a',
          fingerprint: 'fp-2',
        },
      ]),
      chunker: new SimpleChunker({ chunkSize: 20, overlap: 0 }),
      embedder,
      store,
      mode: 'incremental',
    });

    expect(result.replacedDocuments).toBe(1);
    expect(result.documentsIndexed).toBe(1);
    expect(store.getAll().every((vector) => vector.metadata?.fingerprint === 'fp-2')).toBe(true);
    expect(
      store
        .getAll()
        .some((vector) => firstIds.includes(vector.id) && vector.metadata?.fingerprint === 'fp-1'),
    ).toBe(false);
  });

  it('deletes stale sources that disappeared from the loader', async () => {
    const store = new MemoryVectorStore();
    const embedder = new MockEmbedder({ dimension: 4 });

    await runIndexing({
      loader: createSourceLoader([
        {
          id: 'doc-a',
          content: 'keep me',
          sourceId: 'source-a',
          fingerprint: 'fp-a',
        },
        {
          id: 'doc-b',
          content: 'remove me',
          sourceId: 'source-b',
          fingerprint: 'fp-b',
        },
      ]),
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder,
      store,
      mode: 'incremental',
    });

    const result = await runIndexing({
      loader: createSourceLoader([
        {
          id: 'doc-a',
          content: 'keep me',
          sourceId: 'source-a',
          fingerprint: 'fp-a',
        },
      ]),
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder,
      store,
      mode: 'incremental',
    });

    expect(result.unchangedDocuments).toBe(1);
    expect(result.staleSourcesDeleted).toBe(1);
    expect(store.getAll().every((vector) => vector.metadata?.sourceId === 'source-a')).toBe(true);
  });

  it('throws when replace is needed but the store cannot delete', async () => {
    const store: VectorStore = {
      async upsert() {},
      async listSourceRecords() {
        return [{ sourceId: 'source-a', fingerprint: 'fp-1' }];
      },
    };

    await expect(
      runIndexing({
        loader: createSourceLoader([
          {
            id: 'doc-1',
            content: 'changed',
            sourceId: 'source-a',
            fingerprint: 'fp-2',
          },
        ]),
        chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
        embedder: new MockEmbedder({ dimension: 4 }),
        store,
        mode: 'incremental',
      }),
    ).rejects.toMatchObject({
      name: 'IndexingError',
      stage: 'delete',
    });
  });
});
