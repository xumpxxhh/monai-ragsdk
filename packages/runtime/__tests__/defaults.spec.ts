import { describe, expect, it } from 'vitest';

import {
  NoopQueryPreprocessor,
  PassthroughRetrievalPostprocessor,
  applyCandidateOrderingStrategy,
  applyCandidatePredicateStrategy,
  applyBudgetTrimStrategy,
  applyNearDuplicateRemovalStrategy,
  applyScoreThresholdStrategy,
  applySourceCoverageStrategy,
  createDefaultPostprocessor,
} from '../src/index.ts';

describe('runtime defaults', () => {
  it('normalizes RuntimeQueryInput into a RetrievalRequest', async () => {
    const preprocessor = new NoopQueryPreprocessor({
      topK: 3,
      indexingMode: 'incremental',
      strategy: 'metadata-first',
      route: 'docs',
      filters: {
        sourceIds: ['docs/runtime'],
      },
      budget: {
        maxCandidates: 10,
        maxChunks: 3,
      },
      rerank: {
        strategy: 'score-threshold',
        minScore: 0.5,
      },
    });

    await expect(
      preprocessor.preprocess(
        {
          query: 'Explain noop preprocessor',
          metadata: {
            source: 'unit-test',
          },
        },
        {
          requestId: 'test',
          input: { query: 'Explain noop preprocessor' },
          options: {},
          startedAt: Date.now(),
        },
      ),
    ).resolves.toMatchObject({
      originalQuery: { query: 'Explain noop preprocessor' },
      effectiveQuery: { query: 'Explain noop preprocessor' },
      topK: 3,
      indexingMode: 'incremental',
      strategy: 'metadata-first',
      route: 'docs',
      filters: {
        sourceIds: ['docs/runtime'],
      },
      budget: {
        maxCandidates: 10,
        maxChunks: 3,
      },
      rerank: {
        strategy: 'score-threshold',
        minScore: 0.5,
      },
      metadata: {
        source: 'unit-test',
      },
    });
  });

  it('passes candidates through as final chunks', async () => {
    const postprocessor = new PassthroughRetrievalPostprocessor();

    await expect(
      postprocessor.postprocess(
        {
          request: {
            originalQuery: { query: 'Explain postprocessor' },
            effectiveQuery: { query: 'Explain postprocessor' },
            budget: {
              maxChunks: 1,
            },
            rerank: {
              minScore: 0.5,
            },
          },
          candidates: [
            {
              chunk: {
                id: 'chunk-1',
                content: 'chunk content',
              },
              score: 0.9,
            },
            {
              chunk: {
                id: 'chunk-2',
                content: 'extra chunk',
              },
              score: 0.3,
            },
          ],
        },
        {
          requestId: 'test',
          input: { query: 'Explain postprocessor' },
          options: {},
          startedAt: Date.now(),
        },
      ),
    ).resolves.toMatchObject({
      chunks: [
        {
          id: 'chunk-1',
          content: 'chunk content',
        },
      ],
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
            content: 'chunk content',
          },
          score: 0.9,
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
            content: 'extra chunk',
          },
          score: 0.3,
        },
      ],
      appliedBudget: {
        maxChunks: 1,
      },
      appliedScoreThreshold: 0.5,
      selectionTrace: [
        {
          selected: true,
          reason: 'selected',
        },
        {
          selected: false,
          reason: 'score-threshold',
        },
      ],
      promptContext: 'query: Explain postprocessor\n\nchunk content',
    });
  });

  it('applies score threshold strategy to candidates', () => {
    expect(
      applyScoreThresholdStrategy(
        [
          {
            chunk: {
              id: 'chunk-1',
              content: 'selected',
            },
            score: 0.8,
          },
          {
            chunk: {
              id: 'chunk-2',
              content: 'dropped',
            },
            score: 0.2,
          },
        ],
        0.5,
      ),
    ).toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
      ],
      appliedScoreThreshold: 0.5,
      selectionTrace: [
        {
          selected: true,
          reason: 'selected',
        },
        {
          selected: false,
          reason: 'score-threshold',
        },
      ],
    });
  });

  it('applies budget trim strategy to candidates', () => {
    expect(
      applyBudgetTrimStrategy(
        [
          {
            chunk: {
              id: 'chunk-1',
              content: '12345',
            },
          },
          {
            chunk: {
              id: 'chunk-2',
              content: '67890',
            },
          },
          {
            chunk: {
              id: 'chunk-3',
              content: 'abcde',
            },
          },
        ],
        {
          maxCandidates: 3,
          maxChunks: 2,
          maxPromptChars: 6,
        },
      ),
    ).toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
        {
          chunk: {
            id: 'chunk-3',
          },
        },
      ],
      appliedBudget: {
        maxCandidates: 3,
        maxChunks: 2,
        maxPromptChars: 6,
      },
    });
  });

  it('treats maxPromptChars as a hard limit', () => {
    expect(
      applyBudgetTrimStrategy(
        [
          {
            chunk: {
              id: 'chunk-1',
              content: '123456789',
            },
          },
        ],
        {
          maxPromptChars: 3,
        },
      ),
    ).toMatchObject({
      selectedCandidates: [],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      selectionTrace: [
        {
          selected: false,
          reason: 'max-prompt-chars',
        },
      ],
    });
  });

  it('applies custom predicate filtering and records the dropped reason', async () => {
    await expect(
      applyCandidatePredicateStrategy(
        [
          {
            chunk: {
              id: 'chunk-1',
              content: 'runtime docs',
            },
            sourceId: 'docs/runtime',
          },
          {
            chunk: {
              id: 'chunk-2',
              content: 'other docs',
            },
            sourceId: 'docs/other',
          },
        ],
        ({ candidate }) => candidate.sourceId === 'docs/runtime',
        {
          request: {
            originalQuery: { query: 'Explain runtime docs' },
            effectiveQuery: { query: 'Explain runtime docs' },
          },
          context: {
            requestId: 'test',
            input: { query: 'Explain runtime docs' },
            options: {},
            startedAt: Date.now(),
          },
        },
      ),
    ).resolves.toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
      ],
      appliedCandidatePredicate: true,
      selectionTrace: [
        {
          selected: true,
          reason: 'selected',
          stage: 'predicate-filter',
        },
        {
          selected: false,
          reason: 'predicate-filter',
          stage: 'predicate-filter',
        },
      ],
    });
  });

  it('keeps selected candidates in the comparator order', () => {
    expect(
      applyCandidateOrderingStrategy(
        [
          {
            chunk: {
              id: 'chunk-1',
              content: 'lower score',
            },
            score: 0.2,
          },
          {
            chunk: {
              id: 'chunk-2',
              content: 'higher score',
            },
            score: 0.9,
          },
        ],
        (left, right) => (right.score ?? 0) - (left.score ?? 0),
        {
          request: {
            originalQuery: { query: 'Explain ordering' },
            effectiveQuery: { query: 'Explain ordering' },
          },
          context: {
            requestId: 'test',
            input: { query: 'Explain ordering' },
            options: {},
            startedAt: Date.now(),
          },
        },
      ),
    ).toMatchObject({
      candidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      selectionTrace: [
        {
          candidate: {
            chunk: {
              id: 'chunk-2',
            },
          },
          order: 0,
          stage: 'context-ordering',
        },
        {
          candidate: {
            chunk: {
              id: 'chunk-1',
            },
          },
          order: 1,
          stage: 'context-ordering',
        },
      ],
    });
  });

  it('supports fixed budget and trace disabling in the default postprocessor', async () => {
    const postprocessor = createDefaultPostprocessor({
      budget: {
        maxCandidates: 1,
      },
      debug: false,
    });

    await expect(
      postprocessor.postprocess(
        {
          request: {
            originalQuery: { query: 'Explain default postprocessor' },
            effectiveQuery: { query: 'Explain default postprocessor' },
          },
          candidates: [
            {
              chunk: {
                id: 'chunk-1',
                content: 'first',
              },
              score: 0.9,
            },
            {
              chunk: {
                id: 'chunk-2',
                content: 'second',
              },
              score: 0.8,
            },
          ],
        },
        {
          requestId: 'test',
          input: { query: 'Explain default postprocessor' },
          options: {},
          startedAt: Date.now(),
        },
      ),
    ).resolves.toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
      ],
      appliedBudget: {
        maxCandidates: 1,
      },
    });
    await expect(
      postprocessor.postprocess(
        {
          request: {
            originalQuery: { query: 'Explain default postprocessor' },
            effectiveQuery: { query: 'Explain default postprocessor' },
          },
          candidates: [
            {
              chunk: {
                id: 'chunk-1',
                content: 'first',
              },
              score: 0.9,
            },
          ],
        },
        {
          requestId: 'test',
          input: { query: 'Explain default postprocessor' },
          options: {},
          startedAt: Date.now(),
        },
      ),
    ).resolves.not.toHaveProperty('selectionTrace');
  });

  it('supports predicate filtering and candidate ordering in the default postprocessor', async () => {
    const postprocessor = new PassthroughRetrievalPostprocessor({
      candidatePredicate: ({ candidate }) => candidate.sourceId !== 'docs/drop',
      orderCandidates: (left, right) => (right.score ?? 0) - (left.score ?? 0),
    });

    const result = await postprocessor.postprocess(
      {
        request: {
          originalQuery: { query: 'Explain configured postprocessor' },
          effectiveQuery: { query: 'Explain configured postprocessor' },
        },
        candidates: [
          {
            chunk: {
              id: 'chunk-1',
              content: 'kept but lower score',
            },
            sourceId: 'docs/runtime',
            score: 0.7,
          },
          {
            chunk: {
              id: 'chunk-2',
              content: 'dropped by predicate',
            },
            sourceId: 'docs/drop',
            score: 1,
          },
          {
            chunk: {
              id: 'chunk-3',
              content: 'kept and higher score',
            },
            sourceId: 'docs/runtime',
            score: 0.9,
          },
        ],
      },
      {
        requestId: 'test',
        input: { query: 'Explain configured postprocessor' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(result).toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-3',
          },
        },
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
      ],
    });
    expect(result.selectionTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidate: expect.objectContaining({
            chunk: expect.objectContaining({
              id: 'chunk-3',
            }),
          }),
          stage: 'context-ordering',
          order: 0,
        }),
        expect.objectContaining({
          candidate: expect.objectContaining({
            chunk: expect.objectContaining({
              id: 'chunk-2',
            }),
          }),
          stage: 'predicate-filter',
          reason: 'predicate-filter',
          selected: false,
        }),
        expect.objectContaining({
          candidate: expect.objectContaining({
            chunk: expect.objectContaining({
              id: 'chunk-1',
            }),
          }),
          stage: 'context-ordering',
          order: 1,
        }),
      ]),
    );
  });

  it('removes near-duplicate candidates by fingerprint and keeps the higher-scored one', () => {
    expect(
      applyNearDuplicateRemovalStrategy(
        [
          {
            chunk: {
              id: 'chunk-1',
              content: 'runtime guide introduction',
            },
            fingerprint: 'shared-fingerprint',
            score: 0.6,
          },
          {
            chunk: {
              id: 'chunk-2',
              content: 'runtime guide introduction updated',
            },
            fingerprint: 'shared-fingerprint',
            score: 0.95,
          },
        ],
        {
          enabled: true,
        },
        {
          request: {
            originalQuery: { query: 'Explain runtime guide' },
            effectiveQuery: { query: 'Explain runtime guide' },
          },
          context: {
            requestId: 'test',
            input: { query: 'Explain runtime guide' },
            options: {},
            startedAt: Date.now(),
          },
        },
      ),
    ).toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      appliedNearDuplicateRemoval: true,
    });
  });

  it('falls back to normalized text similarity for near-duplicate removal', () => {
    expect(
      applyNearDuplicateRemovalStrategy(
        [
          {
            chunk: {
              id: 'chunk-1',
              content: 'Runtime architecture overview for the knowledge base',
            },
            score: 0.9,
          },
          {
            chunk: {
              id: 'chunk-2',
              content: 'runtime architecture overview for knowledge base',
            },
            score: 0.7,
          },
        ],
        {
          enabled: true,
          similarityThreshold: 0.8,
        },
        {
          request: {
            originalQuery: { query: 'Explain runtime architecture' },
            effectiveQuery: { query: 'Explain runtime architecture' },
          },
          context: {
            requestId: 'test',
            input: { query: 'Explain runtime architecture' },
            options: {},
            startedAt: Date.now(),
          },
        },
      ),
    ).toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
      ],
      selectionTrace: [
        {
          selected: true,
          stage: 'duplicate-removal',
        },
        {
          selected: false,
          reason: 'duplicate',
          stage: 'duplicate-removal',
        },
      ],
    });
  });

  it('applies source coverage by limiting candidates per source', () => {
    expect(
      applySourceCoverageStrategy(
        [
          {
            chunk: {
              id: 'chunk-1',
              content: 'runtime source 1',
            },
            sourceId: 'docs/runtime',
          },
          {
            chunk: {
              id: 'chunk-2',
              content: 'runtime source 2',
            },
            sourceId: 'docs/runtime',
          },
          {
            chunk: {
              id: 'chunk-3',
              content: 'indexing source 1',
            },
            sourceId: 'docs/indexing',
          },
        ],
        {
          enabled: true,
          maxPerSource: 1,
        },
      ),
    ).toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
        {
          chunk: {
            id: 'chunk-3',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
      ],
      appliedSourceCoverage: true,
      selectionTrace: [
        {
          selected: true,
          stage: 'source-coverage',
        },
        {
          selected: false,
          reason: 'source-coverage-quota',
          stage: 'source-coverage',
        },
        {
          selected: true,
          stage: 'source-coverage',
        },
      ],
    });
  });

  it('supports duplicate removal and source coverage in the default postprocessor', async () => {
    const postprocessor = createDefaultPostprocessor({
      nearDuplicateRemovalConfig: {
        enabled: true,
      },
      sourceCoverageConfig: {
        enabled: true,
        maxPerSource: 1,
      },
      debug: true,
    });

    const result = await postprocessor.postprocess(
      {
        request: {
          originalQuery: { query: 'Explain runtime sources' },
          effectiveQuery: { query: 'Explain runtime sources' },
        },
        candidates: [
          {
            chunk: {
              id: 'chunk-1',
              content: 'runtime primary chunk',
            },
            fingerprint: 'runtime-fp',
            sourceId: 'docs/runtime',
            score: 0.95,
          },
          {
            chunk: {
              id: 'chunk-2',
              content: 'runtime primary chunk',
            },
            fingerprint: 'runtime-fp',
            sourceId: 'docs/runtime',
            score: 0.9,
          },
          {
            chunk: {
              id: 'chunk-3',
              content: 'runtime secondary chunk',
            },
            sourceId: 'docs/runtime',
            score: 0.85,
          },
          {
            chunk: {
              id: 'chunk-4',
              content: 'indexing chunk',
            },
            sourceId: 'docs/indexing',
            score: 0.8,
          },
        ],
      },
      {
        requestId: 'test',
        input: { query: 'Explain runtime sources' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(result).toMatchObject({
      selectedCandidates: [
        {
          chunk: {
            id: 'chunk-1',
          },
        },
        {
          chunk: {
            id: 'chunk-4',
          },
        },
      ],
      droppedCandidates: [
        {
          chunk: {
            id: 'chunk-2',
          },
        },
        {
          chunk: {
            id: 'chunk-3',
          },
        },
      ],
    });
    expect(result.selectionTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidate: expect.objectContaining({
            chunk: expect.objectContaining({ id: 'chunk-2' }),
          }),
          stage: 'duplicate-removal',
          reason: 'duplicate',
          selected: false,
        }),
        expect.objectContaining({
          candidate: expect.objectContaining({
            chunk: expect.objectContaining({ id: 'chunk-3' }),
          }),
          stage: 'source-coverage',
          reason: 'source-coverage-quota',
          selected: false,
        }),
      ]),
    );
  });
});
