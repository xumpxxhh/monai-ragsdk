import { describe, expect, it } from 'vitest';

import { LangChainSemanticChunkerAdapter } from '../src/index.ts';

describe('LangChainSemanticChunkerAdapter', () => {
  it('chunks documents through createDocuments when provided', async () => {
    const adapter = new LangChainSemanticChunkerAdapter({
      chunker: {
        async createDocuments(texts, metadatas) {
          expect(texts).toEqual(['Semantic chunking input']);
          expect(metadatas?.[0]).toMatchObject({ source: 'unit-test' });

          return [
            {
              id: 'semantic-1',
              pageContent: 'Semantic chunk',
              metadata: {
                strategy: 'semantic',
                score: 0.91,
              },
            },
          ];
        },
      },
    });

    const chunks = await adapter.chunk({
      id: 'doc-semantic',
      content: 'Semantic chunking input',
      metadata: { source: 'unit-test' },
    });

    expect(chunks).toEqual([
      {
        id: 'semantic-1',
        content: 'Semantic chunk',
        metadata: {
          source: 'unit-test',
          strategy: 'semantic',
          score: 0.91,
          sourceDocumentId: 'doc-semantic',
          chunkIndex: 0,
        },
      },
    ]);
  });

  it('falls back to splitDocuments when createDocuments is unavailable', async () => {
    const adapter = new LangChainSemanticChunkerAdapter({
      chunker: {
        async splitDocuments(documents) {
          expect(documents[0]).toMatchObject({
            id: 'doc-fallback',
            pageContent: 'fallback content',
          });

          return [
            {
              pageContent: 'fallback chunk',
              metadata: { source: 'split' },
            },
          ];
        },
      },
    });

    const chunks = await adapter.chunk({
      id: 'doc-fallback',
      content: 'fallback content',
    });

    expect(chunks).toEqual([
      {
        id: 'doc-fallback#0',
        content: 'fallback chunk',
        metadata: {
          source: 'split',
          sourceDocumentId: 'doc-fallback',
          chunkIndex: 0,
        },
      },
    ]);
  });
});
