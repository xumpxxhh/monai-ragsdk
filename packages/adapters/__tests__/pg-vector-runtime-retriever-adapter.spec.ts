import { describe, expect, it, vi } from 'vitest';

import { PgVectorRuntimeRetrieverAdapter } from '../src/index.ts';

const runtimeContext = {
  requestId: 'test',
  input: { query: 'runtime 是什么' },
  options: {},
  startedAt: Date.now(),
};

describe('PgVectorRuntimeRetrieverAdapter', () => {
  it('rejects invalid SQL identifiers before querying', () => {
    expect(
      () =>
        new PgVectorRuntimeRetrieverAdapter({
          tableName: 'rag-vectors',
          embedQuery: async () => [0.1, 0.2],
        }),
    ).toThrow(/tableName must be a valid SQL identifier/);
  });

  it('runs vector and keyword retrieval in parallel and fuses by RRF', async () => {
    const embedQuery = vi.fn(async () => [0.1, 0.2]);
    const query = vi.fn(async (sql: string) => {
      if (String(sql).includes('<=>')) {
        return {
          rows: [
            {
              id: 'chunk-a',
              content: 'runtime 负责在线编排',
              metadata: {
                sourceId: 'docs/runtime',
                fingerprint: 'fp-a',
                hierarchyPath: ['runtime', 'api'],
              },
              score: 0.9,
            },
            {
              id: 'chunk-b',
              content: 'faq about runtime',
              metadata: {
                sourceId: 'docs/faq',
                fingerprint: 'fp-b',
              },
              score: 0.7,
            },
          ],
        };
      }

      return {
        rows: [
          {
            id: 'chunk-b',
            content: 'faq about runtime',
            metadata: {
              sourceId: 'docs/faq',
              fingerprint: 'fp-b',
            },
            score: 0.8,
          },
          {
            id: 'chunk-c',
            content: 'unrelated note',
            metadata: {
              sourceId: 'docs/notes',
              fingerprint: 'fp-c',
            },
            score: 0.4,
          },
        ],
      };
    });
    const adapter = new PgVectorRuntimeRetrieverAdapter({
      tableName: 'rag_vectors',
      client: { query },
      embedQuery,
    });

    expect(adapter.id).toBe('pgvector');
    expect(adapter.capabilities).toEqual({ searchTypes: ['hybrid'] });

    const result = await adapter.retrieve(
      {
        originalQuery: { query: 'runtime 是什么' },
        effectiveQuery: { query: 'runtime 是什么' },
        route: 'docs',
        strategy: 'vector-search',
        budget: { maxChunks: 2 },
      },
      runtimeContext,
    );

    expect(embedQuery).toHaveBeenCalledWith('runtime 是什么');
    expect(query).toHaveBeenCalledTimes(2);
    const vectorCall = query.mock.calls.find((call) => String(call[0]).includes('<=>'));
    const keywordCall = query.mock.calls.find((call) =>
      String(call[0]).includes('plainto_tsquery'),
    );
    expect(vectorCall?.[1]).toEqual(['[0.1,0.2]', 100]);
    expect(keywordCall?.[1]).toEqual(['runtime 是什么', 100]);
    expect(result.candidates.map((candidate) => candidate.chunk.id)).toEqual([
      'chunk-b',
      'chunk-a',
    ]);
    expect(result.candidates[0]).toMatchObject({
      score: expect.any(Number),
      scoreKind: 'rrf',
      route: 'docs',
      strategy: 'vector-search',
      sourceId: 'docs/faq',
      fingerprint: 'fp-b',
      retrieverMetadata: {
        provider: 'pgvector',
        searchType: 'hybrid',
      },
    });
    expect(result.retrievalMetadata).toMatchObject({
      provider: 'pgvector',
      topK: 2,
      vectorCandidateCount: 2,
      keywordCandidateCount: 2,
      fusedCandidateCount: 3,
      filteredCandidateCount: 2,
    });
  });

  it('applies runtime sourceId filters after fusion', async () => {
    const query = vi.fn(async (sql: string) => {
      if (String(sql).includes('<=>')) {
        return {
          rows: [
            {
              id: 'chunk-runtime',
              content: 'runtime api',
              metadata: { sourceId: 'docs/runtime' },
              score: 0.9,
            },
            {
              id: 'chunk-faq',
              content: 'runtime faq',
              metadata: { sourceId: 'docs/faq' },
              score: 0.8,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const adapter = new PgVectorRuntimeRetrieverAdapter({
      tableName: 'rag_vectors',
      client: { query },
      embedQuery: async () => [1, 0],
    });

    const result = await adapter.retrieve(
      {
        originalQuery: { query: 'runtime' },
        effectiveQuery: { query: 'runtime' },
        filters: {
          sourceIds: ['docs/runtime'],
        },
        budget: { maxChunks: 3 },
      },
      runtimeContext,
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      chunk: { id: 'chunk-runtime' },
      sourceId: 'docs/runtime',
      matchedFilters: ['sourceIds'],
    });
  });

  it('falls back to metadata content when the content column is null', async () => {
    const query = vi.fn(async (sql: string) => {
      if (String(sql).includes('<=>')) {
        return {
          rows: [
            {
              id: 'chunk-1',
              content: null,
              metadata: {
                content: 'stored in metadata',
                sourceId: 'docs/runtime',
              },
              score: 0.5,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const adapter = new PgVectorRuntimeRetrieverAdapter({
      tableName: 'rag_vectors',
      client: { query },
      embedQuery: async () => [0.2, 0.1],
    });

    const result = await adapter.retrieve(
      {
        originalQuery: { query: 'runtime' },
        effectiveQuery: { query: 'runtime' },
        budget: { maxChunks: 1 },
      },
      runtimeContext,
    );

    expect(result.candidates[0]?.chunk.content).toBe('stored in metadata');
  });
});
