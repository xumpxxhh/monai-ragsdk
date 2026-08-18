import { describe, expect, it } from 'vitest';

import {
  createIndexingRetrievalCandidate,
  createIndexingRetrievalFilters,
  createIndexingRetrievalRequest,
  filterRetrievalCandidatesByIndexingFilters,
  matchRetrievalCandidateFilters,
} from '../src/index.ts';

describe('indexing query protocol helpers', () => {
  it('normalizes indexing filter input into runtime retrieval filters', () => {
    expect(
      createIndexingRetrievalFilters({
        sourceIds: ['docs/runtime'],
        hierarchyPath: ['runtime', 'api'],
        metadata: {
          documentTitle: 'Runtime API',
        },
      }),
    ).toEqual({
      sourceIds: ['docs/runtime'],
      hierarchyPaths: ['runtime/api'],
      metadata: {
        documentTitle: 'Runtime API',
      },
    });
  });

  it('builds a runtime retrieval request aligned with indexing Phase D metadata', () => {
    expect(
      createIndexingRetrievalRequest({
        originalQuery: { query: 'runtime' },
        effectiveQuery: { query: 'runtime site:docs' },
        strategy: 'metadata-first',
        filters: {
          sourceIds: ['docs/runtime'],
          parentHierarchyPath: ['runtime'],
        },
      }),
    ).toMatchObject({
      strategy: 'metadata-first',
      filters: {
        sourceIds: ['docs/runtime'],
        parentHierarchyPaths: ['runtime'],
      },
    });
  });

  it('maps indexing metadata on chunk metadata into a retrieval candidate', () => {
    expect(
      createIndexingRetrievalCandidate(
        {
          id: 'chunk-1',
          content: 'runtime api section',
          metadata: {
            sourceId: 'docs/runtime',
            fingerprint: 'fp-1',
            hierarchyPath: ['runtime', 'api'],
            parentHierarchyPath: ['runtime'],
            hierarchyDepth: 2,
            documentTitle: 'Runtime API',
          },
        },
        {
          score: 0.93,
          route: 'docs',
          strategy: 'metadata-first',
        },
      ),
    ).toMatchObject({
      score: 0.93,
      route: 'docs',
      strategy: 'metadata-first',
      sourceId: 'docs/runtime',
      fingerprint: 'fp-1',
      hierarchyPath: 'runtime/api',
      parentHierarchyPath: 'runtime',
      hierarchyDepth: 2,
    });
  });

  it('matches and filters candidates using indexing-derived retrieval filters', () => {
    const filters = createIndexingRetrievalFilters({
      sourceIds: ['docs/runtime'],
      hierarchyPath: ['runtime', 'api'],
      minHierarchyDepth: 2,
      metadata: {
        documentTitle: 'Runtime API',
      },
    });

    const matchedCandidate = createIndexingRetrievalCandidate(
      {
        id: 'chunk-1',
        content: 'runtime api section',
        metadata: {
          sourceId: 'docs/runtime',
          hierarchyPath: ['runtime', 'api'],
          hierarchyDepth: 2,
          documentTitle: 'Runtime API',
        },
      },
      {
        filters,
      },
    );

    const droppedCandidate = createIndexingRetrievalCandidate({
      id: 'chunk-2',
      content: 'runtime faq section',
      metadata: {
        sourceId: 'docs/runtime',
        hierarchyPath: ['runtime', 'faq'],
        hierarchyDepth: 2,
        documentTitle: 'Runtime FAQ',
      },
    });

    expect(matchRetrievalCandidateFilters(matchedCandidate, filters)).toEqual({
      matched: true,
      matchedFilters: ['sourceIds', 'hierarchyPaths', 'minHierarchyDepth', 'metadata'],
    });

    expect(
      filterRetrievalCandidatesByIndexingFilters([matchedCandidate, droppedCandidate], filters),
    ).toHaveLength(1);
    expect(
      filterRetrievalCandidatesByIndexingFilters([matchedCandidate, droppedCandidate], filters)[0],
    ).toMatchObject({
      chunk: {
        id: 'chunk-1',
      },
      matchedFilters: ['sourceIds', 'hierarchyPaths', 'minHierarchyDepth', 'metadata'],
    });
  });

  it('matches metadata filters using stable deep comparison', () => {
    const filters = createIndexingRetrievalFilters({
      metadata: {
        extra: {
          b: 2,
          a: 1,
        },
      },
    });

    const candidate = createIndexingRetrievalCandidate({
      id: 'chunk-1',
      content: 'runtime api section',
      metadata: {
        extra: {
          a: 1,
          b: 2,
        },
      },
    });

    expect(matchRetrievalCandidateFilters(candidate, filters)).toEqual({
      matched: true,
      matchedFilters: ['metadata'],
    });
  });
});
