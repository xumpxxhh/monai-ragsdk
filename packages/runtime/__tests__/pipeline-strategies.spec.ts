import { describe, expect, it } from 'vitest';

import {
  FanOutRetriever,
  StrategyQueryPreprocessor,
  StrategyRetrievalPostprocessor,
  applyLostInTheMiddleStrategy,
  buildPassthroughStrategies,
  createDefaultRuntime,
  createLostInTheMiddleStrategy,
  fuseByReciprocalRankFusion,
} from '../src/index.ts';

describe('pipeline strategy framework', () => {
  it('runs query strategies in order', async () => {
    const preprocessor = new StrategyQueryPreprocessor({
      strategies: [
        {
          async apply(request) {
            return {
              ...request,
              effectiveQuery: { query: `${request.effectiveQuery.query} v1` },
            };
          },
        },
        {
          async apply(request) {
            return {
              ...request,
              effectiveQuery: { query: `${request.effectiveQuery.query} v2` },
              route: 'rewritten',
            };
          },
        },
      ],
    });

    const request = await preprocessor.preprocess(
      { query: 'hello' },
      {
        requestId: 'req-1',
        input: { query: 'hello' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(request.effectiveQuery.query).toBe('hello v1 v2');
    expect(request.route).toBe('rewritten');
    expect(request.appliedStrategies).toEqual(['query-strategy-0', 'query-strategy-1']);
  });

  it('fans out subQueries and fuses retrieval results', async () => {
    const retriever = new FanOutRetriever({
      retriever: {
        async retrieve(request) {
          return {
            candidates: [
              {
                chunk: {
                  id: `chunk-${request.effectiveQuery.query}`,
                  content: request.effectiveQuery.query,
                },
                score: request.effectiveQuery.query.includes('a') ? 0.9 : 0.8,
              },
            ],
          };
        },
      },
    });

    const result = await retriever.retrieve(
      {
        originalQuery: { query: 'root' },
        effectiveQuery: { query: 'root' },
        subQueries: [{ query: 'query-a' }, { query: 'query-b' }],
      },
      {
        requestId: 'req-1',
        input: { query: 'root' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.retrievalMetadata).toMatchObject({
      provider: 'fan-out',
      subQueryCount: 2,
    });
  });

  it('fuses ranked lists with reciprocal rank fusion', () => {
    const listA = [
      {
        chunk: { id: 'shared', content: 'shared' },
        score: 0.9,
      },
      {
        chunk: { id: 'only-a', content: 'only-a' },
        score: 0.8,
      },
    ];
    const listB = [
      {
        chunk: { id: 'shared', content: 'shared' },
        score: 0.7,
      },
      {
        chunk: { id: 'only-b', content: 'only-b' },
        score: 0.6,
      },
    ];

    const fused = fuseByReciprocalRankFusion([listA, listB], { k: 60 });

    expect(fused[0]?.chunk.id).toBe('shared');
    expect(fused.map((candidate) => candidate.chunk.id)).toEqual(['shared', 'only-a', 'only-b']);
  });

  it('reorders candidates with lost in the middle', () => {
    const candidates = [
      { chunk: { id: 'low', content: 'low' }, score: 0.1 },
      { chunk: { id: 'high', content: 'high' }, score: 0.9 },
      { chunk: { id: 'mid', content: 'mid' }, score: 0.5 },
    ];

    const result = applyLostInTheMiddleStrategy(candidates);

    expect(result.candidates.map((candidate) => candidate.chunk.id)).toEqual([
      'high',
      'low',
      'mid',
    ]);
  });

  it('keeps passthrough postprocessor behavior equivalent via strategy chain', async () => {
    const postprocessor = new StrategyRetrievalPostprocessor({
      strategies: buildPassthroughStrategies({
        scoreThreshold: 0.7,
      }),
    });

    const result = await postprocessor.postprocess(
      {
        request: {
          originalQuery: { query: 'q' },
          effectiveQuery: { query: 'q' },
        },
        candidates: [
          {
            chunk: { id: 'keep', content: 'keep' },
            score: 0.9,
          },
          {
            chunk: { id: 'drop', content: 'drop' },
            score: 0.2,
          },
        ],
      },
      {
        requestId: 'req-1',
        input: { query: 'q' },
        options: {},
        startedAt: Date.now(),
      },
    );

    expect(result.chunks.map((chunk) => chunk.id)).toEqual(['keep']);
    expect(result.droppedCandidates?.map((candidate) => candidate.chunk.id)).toEqual(['drop']);
  });

  it('supports custom postprocessor strategy arrays in end-to-end runtime', async () => {
    const runtime = createDefaultRuntime({
      postprocessor: new StrategyRetrievalPostprocessor({
        strategies: [createLostInTheMiddleStrategy()],
      }),
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: { id: 'low', content: 'low' },
                score: 0.1,
              },
              {
                chunk: { id: 'high', content: 'high' },
                score: 0.9,
              },
            ],
          };
        },
      },
      generator: {
        async generate({ chunks }) {
          return {
            answer: chunks.map((chunk) => chunk.id).join(','),
          };
        },
      },
    });

    const result = await runtime.run({ query: 'order' });

    expect(result.chunks.map((chunk) => chunk.id)).toEqual(['high', 'low']);
    expect(result.answer).toBe('high,low');
  });
});
