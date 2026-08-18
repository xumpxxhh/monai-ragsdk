import { describe, expect, it, vi } from 'vitest';

import { LangChainEmbeddingsAdapter } from '../src/index.ts';

describe('LangChainEmbeddingsAdapter', () => {
  it('converts chunk embeddings into rag vectors', async () => {
    const adapter = new LangChainEmbeddingsAdapter({
      embeddings: {
        async embedDocuments(texts) {
          return texts.map((text, index) => [text.length, index + 1]);
        },
      },
    });

    const vectors = await adapter.embed([
      {
        id: 'chunk-1',
        content: 'hello',
        metadata: { sourceDocumentId: 'doc-1', chunkIndex: 0 },
      },
      {
        id: 'chunk-2',
        content: 'world!',
        metadata: { sourceDocumentId: 'doc-1', chunkIndex: 1 },
      },
    ]);

    expect(vectors).toEqual([
      {
        id: 'chunk-1',
        values: [5, 1],
        metadata: { sourceDocumentId: 'doc-1', chunkIndex: 0 },
      },
      {
        id: 'chunk-2',
        values: [6, 2],
        metadata: { sourceDocumentId: 'doc-1', chunkIndex: 1 },
      },
    ]);
  });

  it('returns an empty vector list without calling embeddings for empty input', async () => {
    const embedDocuments = vi.fn(async () => [[1, 2, 3]]);
    const adapter = new LangChainEmbeddingsAdapter({
      embeddings: {
        embedDocuments,
      },
    });

    const vectors = await adapter.embed([]);

    expect(vectors).toEqual([]);
    expect(embedDocuments).not.toHaveBeenCalled();
  });

  it('throws when embedding result count does not match chunk count', async () => {
    const adapter = new LangChainEmbeddingsAdapter({
      embeddings: {
        async embedDocuments() {
          return [[0.1, 0.2]];
        },
      },
    });

    await expect(
      adapter.embed([
        { id: 'chunk-1', content: 'alpha' },
        { id: 'chunk-2', content: 'beta' },
      ]),
    ).rejects.toThrow('Embedding result count mismatch: expected 2, received 1');
  });
});
