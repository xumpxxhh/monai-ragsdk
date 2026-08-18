import { describe, expect, it, vi } from 'vitest';

import { LangChainRuntimeRetrieverAdapter } from '../src/index.ts';

describe('LangChainRuntimeRetrieverAdapter', () => {
  it('maps LangChain retriever output into runtime candidates and applies runtime filters', async () => {
    const invoke = vi.fn(async () => [
      {
        id: 'chunk-1',
        pageContent: 'runtime api',
        score: 0.91,
        metadata: {
          sourceId: 'docs/runtime',
          hierarchyPath: ['runtime', 'api'],
        },
      },
      {
        id: 'chunk-2',
        pageContent: 'runtime faq',
        score: 0.67,
        metadata: {
          sourceId: 'docs/faq',
          hierarchyPath: ['runtime', 'faq'],
        },
      },
    ]);
    const adapter = new LangChainRuntimeRetrieverAdapter({
      retriever: { invoke },
    });

    const result = await adapter.retrieve(
      {
        originalQuery: { query: 'Explain runtime' },
        effectiveQuery: { query: 'Explain runtime site:docs' },
        route: 'docs',
        strategy: 'metadata-first',
        filters: {
          sourceIds: ['docs/runtime'],
          hierarchyPaths: ['runtime/api'],
        },
      },
      {
        requestId: 'test',
        input: { query: 'Explain runtime' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(invoke).toHaveBeenCalledWith('Explain runtime site:docs');
    expect(result).toMatchObject({
      candidates: [
        {
          chunk: {
            id: 'chunk-1',
            content: 'runtime api',
            metadata: {
              sourceId: 'docs/runtime',
              hierarchyPath: ['runtime', 'api'],
            },
          },
          score: 0.91,
          route: 'docs',
          strategy: 'metadata-first',
          sourceId: 'docs/runtime',
          hierarchyPath: 'runtime/api',
          matchedFilters: ['sourceIds', 'hierarchyPaths'],
        },
      ],
    });
  });

  it('supports custom request mapping and retrieval metadata building', async () => {
    const adapter = new LangChainRuntimeRetrieverAdapter<
      { query: string; topK?: number },
      {
        documents: Array<{
          pageContent: string;
          metadata?: Record<string, unknown>;
        }>;
      }
    >({
      retriever: {
        async invoke(input) {
          expect(input).toEqual({
            query: 'Explain runtime site:docs',
            topK: 2,
          });

          return {
            documents: [
              {
                pageContent: 'runtime body',
                metadata: {
                  sourceId: 'docs/runtime',
                },
              },
            ],
          };
        },
      },
      mapRequest(request) {
        return {
          query: request.effectiveQuery.query,
          topK: request.topK,
        };
      },
      extractDocuments(result) {
        return result.documents;
      },
      buildRetrievalMetadata({ candidates, filteredCandidates }) {
        return {
          originalCandidateCount: candidates.length,
          finalCandidateCount: filteredCandidates.length,
        };
      },
    });

    const result = await adapter.retrieve(
      {
        originalQuery: { query: 'Explain runtime' },
        effectiveQuery: { query: 'Explain runtime site:docs' },
        topK: 2,
      },
      {
        requestId: 'test',
        input: { query: 'Explain runtime' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(result.retrievalMetadata).toEqual({
      originalCandidateCount: 1,
      finalCandidateCount: 1,
    });
    expect(result.candidates[0]?.chunk.content).toBe('runtime body');
  });
});
