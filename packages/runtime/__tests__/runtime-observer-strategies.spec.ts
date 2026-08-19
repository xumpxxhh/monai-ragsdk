import { describe, expect, it, vi } from 'vitest';

import type { RAGErrorRecord, RAGEvent, RAGTrace } from '@monai-ragsdk/observability';

import {
  FanOutRetriever,
  RuntimeError,
  StrategyQueryPreprocessor,
  StrategyRetrievalPostprocessor,
  createRuntime,
  createScoreThresholdStrategy,
} from '../src/index.ts';

describe('runtime observer strategy events', () => {
  it('emits per-strategy, fan-out, and post-retrieval events in order', async () => {
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();
    const runtime = createRuntime({
      observer: {
        onEvent,
        onTraceEnd,
      },
      preprocessor: new StrategyQueryPreprocessor({
        strategies: [
          {
            name: 'query-rewrite',
            async apply(request) {
              return {
                ...request,
                effectiveQuery: { query: `${request.effectiveQuery.query} rewritten` },
                rewriteReason: 'query-rewrite',
                subQueries: [
                  { query: `${request.effectiveQuery.query} rewritten` },
                  { query: 'alt query' },
                ],
              };
            },
          },
          {
            name: 'query-expansion',
            async apply(request) {
              return request;
            },
          },
        ],
      }),
      retriever: new FanOutRetriever({
        retriever: {
          async retrieve(request) {
            const isAlt = request.effectiveQuery.query === 'alt query';
            return {
              candidates: [
                {
                  chunk: {
                    id: isAlt ? 'chunk-2' : 'chunk-1',
                    content: isAlt ? 'dropped body' : 'kept body',
                  },
                  score: isAlt ? 0.4 : 0.91,
                },
              ],
            };
          },
        },
        fuse: (rankedLists) => rankedLists.flat(),
      }),
      postprocessor: new StrategyRetrievalPostprocessor({
        strategies: [createScoreThresholdStrategy({ scoreThreshold: 0.5 })],
      }),
      generator: {
        async generate() {
          return {
            answer: 'answer',
            generationMetadata: { model: 'unit-test-model' },
          };
        },
      },
    });

    const result = await runtime.run(
      { query: 'hello' },
      {
        requestId: 'request-1',
        trace: { traceId: 'trace-1' },
      },
    );

    const eventNames = onEvent.mock.calls.map((call) => call[0]!.name);
    expect(eventNames).toEqual([
      'runtime.query.receive',
      'runtime.query_strategy.complete',
      'runtime.query_strategy.complete',
      'runtime.query.preprocess',
      'runtime.retrieval.start',
      'runtime.retrieval_fanout.complete',
      'runtime.retrieval_fanout.complete',
      'runtime.retrieval_fuse.complete',
      'runtime.retrieval.complete',
      'runtime.post_retrieval.start',
      'runtime.post_retrieval_strategy.complete',
      'runtime.post_retrieval.select',
      'runtime.generation.start',
      'runtime.generation.complete',
      'runtime.run.complete',
    ]);

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.query_strategy.complete',
        attributes: expect.objectContaining({
          strategy: { name: 'query-rewrite', index: 0 },
          outcome: 'applied',
          input: expect.objectContaining({ query: 'hello' }),
          output: expect.objectContaining({ query: 'hello rewritten' }),
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.query_strategy.complete',
        attributes: expect.objectContaining({
          strategy: { name: 'query-expansion', index: 1 },
          outcome: 'passthrough',
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.retrieval_fanout.complete',
        attributes: expect.objectContaining({
          input: { index: 0, query: 'hello rewritten' },
          candidates: [{ chunkId: 'chunk-1', score: 0.91, scoreKind: 'retriever' }],
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.retrieval_fanout.complete',
        attributes: expect.objectContaining({
          input: { index: 1, query: 'alt query' },
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.retrieval_fuse.complete',
        attributes: expect.objectContaining({
          counts: { subQueries: 2, fused: 2 },
          candidates: [
            { chunkId: 'chunk-1', score: 0.91, scoreKind: 'rrf' },
            { chunkId: 'chunk-2', score: 0.4, scoreKind: 'rrf' },
          ],
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.retrieval.complete',
        attributes: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({ chunkId: 'chunk-1', scoreKind: 'rrf' }),
          ]),
          output: expect.objectContaining({ provider: 'fan-out' }),
        }),
      }),
    );

    const postStrategyEvent = onEvent.mock.calls
      .map((call) => call[0]!)
      .find((event) => event.name === 'runtime.post_retrieval_strategy.complete');
    expect(postStrategyEvent?.attributes).toMatchObject({
      strategy: { name: 'score-threshold', index: 0 },
      outcome: 'applied',
      counts: expect.objectContaining({
        selected: 1,
        dropped: 1,
      }),
    });
    expect(JSON.stringify(postStrategyEvent?.attributes)).not.toContain('dropped body');
    expect(JSON.stringify(postStrategyEvent?.attributes)).not.toContain('kept body');
    const selectEvent = onEvent.mock.calls
      .map((call) => call[0]!)
      .find((event) => event.name === 'runtime.post_retrieval.select');
    expect(selectEvent?.attributes).not.toHaveProperty('decisions');

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.generation.complete',
        attributes: expect.objectContaining({
          output: expect.objectContaining({
            model: 'unit-test-model',
            citations: [{ index: 1, chunkId: 'chunk-1' }],
          }),
        }),
      }),
    );

    expect(result.strategies?.preRetrieval).toEqual(['query-rewrite', 'query-expansion']);
    expect(result.strategies?.postRetrieval).toEqual(['score-threshold']);
    expect(onTraceEnd).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
  });

  it('emits query_strategy.fail then runtime.run.fail when a strategy throws', async () => {
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onError = vi.fn<(error: RAGErrorRecord) => Promise<void>>();
    const runtime = createRuntime({
      observer: {
        onEvent,
        onError,
      },
      preprocessor: new StrategyQueryPreprocessor({
        strategies: [
          {
            name: 'query-rewrite',
            async apply() {
              throw new Error('rewrite boom');
            },
          },
        ],
      }),
      retriever: {
        async retrieve() {
          return { candidates: [] };
        },
      },
      postprocessor: {
        async postprocess() {
          return { chunks: [] };
        },
      },
      generator: {
        async generate() {
          return { answer: 'never' };
        },
      },
    });

    await expect(runtime.run({ query: 'hello' })).rejects.toBeInstanceOf(RuntimeError);

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.query_strategy.fail',
        attributes: expect.objectContaining({
          strategy: { name: 'query-rewrite', index: 0 },
          outcome: 'failed',
          error: expect.objectContaining({
            message: 'rewrite boom',
          }),
        }),
      }),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.query_strategy.fail',
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ name: 'runtime.run.fail' }));
  });

  it('swallows observer failures on strategy-level events', async () => {
    const runtime = createRuntime({
      observer: {
        async onEvent() {
          throw new Error('observer failed');
        },
      },
      preprocessor: new StrategyQueryPreprocessor({
        strategies: [
          {
            name: 'query-rewrite',
            async apply(request) {
              return {
                ...request,
                effectiveQuery: { query: `${request.effectiveQuery.query} rewritten` },
              };
            },
          },
        ],
      }),
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: { id: 'chunk-1', content: 'kept' },
                score: 0.9,
              },
            ],
          };
        },
      },
      postprocessor: new StrategyRetrievalPostprocessor({
        strategies: [createScoreThresholdStrategy({ scoreThreshold: 0.1 })],
      }),
      generator: {
        async generate() {
          return { answer: 'answer' };
        },
      },
    });

    await expect(runtime.run({ query: 'hello' })).resolves.toMatchObject({
      answer: 'answer',
    });
  });
});
