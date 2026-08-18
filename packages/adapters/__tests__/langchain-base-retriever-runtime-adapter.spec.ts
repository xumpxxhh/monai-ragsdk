import { Document } from '@langchain/core/documents';
import { BaseRetriever } from '@langchain/core/retrievers';
import type { RunnableConfig } from '@langchain/core/runnables';
import { describe, expect, it } from 'vitest';

import { createLangChainBaseRetrieverRuntimeAdapter } from '../src/index.ts';

class FakeRetriever extends BaseRetriever<{
  sourceId: string;
  hierarchyPath: string[];
  score?: number;
}> {
  lastQuery?: string;
  lastConfig?: RunnableConfig;

  async invoke(input: string, options?: RunnableConfig) {
    this.lastConfig = options;

    return super.invoke(input, options);
  }

  async _getRelevantDocuments(query: string) {
    this.lastQuery = query;

    return [
      new Document({
        id: 'chunk-1',
        pageContent: `runtime api for ${query}`,
        metadata: {
          sourceId: 'docs/runtime',
          hierarchyPath: ['runtime', 'api'],
          score: 0.91,
        },
      }),
      new Document({
        id: 'chunk-2',
        pageContent: `faq for ${query}`,
        metadata: {
          sourceId: 'docs/faq',
          hierarchyPath: ['runtime', 'faq'],
          score: 0.2,
        },
      }),
    ];
  }
}

describe('createLangChainBaseRetrieverRuntimeAdapter', () => {
  it('wraps a BaseRetriever and reuses runtime filter semantics', async () => {
    const retriever = new FakeRetriever();
    const adapter = createLangChainBaseRetrieverRuntimeAdapter({
      retriever,
      mapRunnableConfig(request) {
        return {
          tags: [`route:${request.route ?? 'default'}`],
        };
      },
    });

    const result = await adapter.retrieve(
      {
        originalQuery: { query: 'Explain runtime' },
        effectiveQuery: { query: 'Explain runtime site:docs' },
        route: 'docs',
        strategy: 'metadata-first',
        filters: {
          sourceIds: ['docs/runtime'],
        },
      },
      {
        requestId: 'test',
        input: { query: 'Explain runtime' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(retriever.lastQuery).toBe('Explain runtime site:docs');
    expect(retriever.lastConfig?.tags).toEqual(['route:docs']);
    expect(result).toMatchObject({
      candidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
          score: 0.91,
          sourceId: 'docs/runtime',
          matchedFilters: ['sourceIds'],
        },
      ],
    });
  });

  it('supports custom query mapping and retrieval metadata building', async () => {
    const retriever = new FakeRetriever();
    const adapter = createLangChainBaseRetrieverRuntimeAdapter({
      retriever,
      mapQuery(request) {
        return `rerouted:${request.effectiveQuery.query}`;
      },
      buildRetrievalMetadata({ result, filteredCandidates }) {
        return {
          originalCandidateCount: result.length,
          finalCandidateCount: filteredCandidates.length,
        };
      },
    });

    const result = await adapter.retrieve(
      {
        originalQuery: { query: 'Explain runtime' },
        effectiveQuery: { query: 'Explain runtime site:docs' },
      },
      {
        requestId: 'test',
        input: { query: 'Explain runtime' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(retriever.lastQuery).toBe('rerouted:Explain runtime site:docs');
    expect(result.retrievalMetadata).toEqual({
      originalCandidateCount: 2,
      finalCandidateCount: 2,
    });
  });
});
