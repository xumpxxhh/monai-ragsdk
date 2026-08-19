import { describe, expect, it, vi } from 'vitest';

import type { RAGErrorRecord, RAGEvent, RAGTrace } from '@monai-ragsdk/observability';

import { RuntimeError, createRuntime } from '../src/index.ts';

describe('runtime observer integration', () => {
  it('keeps runtime behavior unchanged when no observer is provided', async () => {
    const runtime = createRuntime({
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
          };
        },
      },
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: {
                  id: 'chunk-1',
                  content: 'retrieved content',
                },
                score: 0.9,
              },
            ],
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return {
            chunks: [candidates[0]!.chunk],
          };
        },
      },
      generator: {
        async generate() {
          return {
            answer: 'answer',
          };
        },
      },
    });

    await expect(runtime.run({ query: 'hello' })).resolves.toMatchObject({
      answer: 'answer',
      chunks: [{ id: 'chunk-1', content: 'retrieved content' }],
      citations: [
        {
          index: 1,
          chunkId: 'chunk-1',
        },
      ],
      originalQuery: { query: 'hello' },
      effectiveQuery: { query: 'hello' },
    });
  });

  it('emits runtime events and trace summaries when an observer is provided', async () => {
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();
    const runtime = createRuntime({
      observer: {
        onEvent,
        onTraceEnd,
      },
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: `${input.query} rewritten` },
            route: 'kb',
            rewriteReason: 'prefer kb route',
            strategy: 'metadata-first',
            filters: {
              sourceIds: ['docs/runtime'],
            },
          };
        },
      },
      retriever: {
        async retrieve(request) {
          return {
            candidates: [
              {
                chunk: {
                  id: 'chunk-1',
                  content: request.effectiveQuery.query,
                },
                score: 0.91,
                scoreKind: 'retriever',
                sourceId: 'docs/runtime',
              },
              {
                chunk: {
                  id: 'chunk-2',
                  content: 'dropped',
                },
                score: 0.4,
                scoreKind: 'retriever',
                sourceId: 'docs/runtime',
              },
            ],
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return {
            chunks: [candidates[0]!.chunk],
            selectedCandidates: [candidates[0]!],
            droppedCandidates: [candidates[1]!],
          };
        },
      },
      generator: {
        async generate({ request }) {
          return {
            answer: `answer for ${request.effectiveQuery.query}`,
          };
        },
      },
    });

    await runtime.run(
      { query: 'hello' },
      {
        requestId: 'request-1',
        trace: {
          traceId: 'trace-1',
          tags: {
            app: 'internal-kb',
          },
        },
      },
    );

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.query.receive',
        attributes: expect.objectContaining({
          output: { query: 'hello' },
        }),
      }),
    );
    const receiveEvent = onEvent.mock.calls
      .map((call) => call[0]!)
      .find((event) => event.name === 'runtime.query.receive');
    expect(receiveEvent?.attributes).not.toHaveProperty('requestId');

    const preprocessEvent = onEvent.mock.calls
      .map((call) => call[0]!)
      .find((event) => event.name === 'runtime.query.preprocess');
    expect(preprocessEvent?.attributes).toMatchObject({
      output: {
        query: 'hello rewritten',
        route: 'kb',
        filters: { sourceIds: ['docs/runtime'] },
      },
    });
    expect(preprocessEvent?.attributes).not.toHaveProperty('strategy');
    expect(JSON.stringify(preprocessEvent?.attributes)).not.toContain('metadata-first');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.retrieval.complete',
        attributes: expect.objectContaining({
          counts: { candidates: 2 },
          candidates: [
            { chunkId: 'chunk-1', score: 0.91, scoreKind: 'retriever' },
            { chunkId: 'chunk-2', score: 0.4, scoreKind: 'retriever' },
          ],
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.post_retrieval.select',
        attributes: expect.objectContaining({
          counts: expect.objectContaining({
            selected: 1,
            dropped: 1,
          }),
          output: expect.objectContaining({
            chunkIds: ['chunk-1'],
          }),
        }),
      }),
    );
    const selectEvent = onEvent.mock.calls
      .map((call) => call[0]!)
      .find((event) => event.name === 'runtime.post_retrieval.select');
    expect(selectEvent?.attributes).not.toHaveProperty('decisions');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.generation.complete',
        attributes: expect.objectContaining({
          output: expect.objectContaining({
            citations: [{ index: 1, chunkId: 'chunk-1' }],
          }),
        }),
      }),
    );
    expect(onTraceEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-1',
        requestId: 'request-1',
        status: 'ok',
        traceIdSource: 'provided',
      }),
    );
  });

  it('marks generated traces when the caller omits requestId and traceId', async () => {
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();
    const runtime = createRuntime({
      observer: { onTraceEnd },
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
          };
        },
      },
      retriever: {
        async retrieve() {
          return { candidates: [{ chunk: { id: 'chunk-1', content: 'c' }, score: 1 }] };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return { chunks: [candidates[0]!.chunk] };
        },
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    await runtime.run({ query: 'hello?' });

    expect(onTraceEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        traceIdSource: 'generated',
        status: 'ok',
      }),
    );
    const trace = onTraceEnd.mock.calls[0]![0]!;
    expect(trace.traceId).not.toContain('hello');
    expect(trace.requestId).not.toContain('hello');
    expect(trace.traceId).not.toBe(trace.requestId);
  });

  it('swallows observer failures without breaking runtime.run', async () => {
    const runtime = createRuntime({
      observer: {
        async onEvent() {
          throw new Error('observer failed');
        },
      },
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
          };
        },
      },
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: {
                  id: 'chunk-1',
                  content: 'retrieved content',
                },
                score: 0.9,
              },
            ],
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return {
            chunks: [candidates[0]!.chunk],
          };
        },
      },
      generator: {
        async generate() {
          return {
            answer: 'answer',
          };
        },
      },
    });

    await expect(runtime.run({ query: 'hello' })).resolves.toMatchObject({
      answer: 'answer',
    });
  });

  it('emits runtime.run.fail and error records on stage failures', async () => {
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onError = vi.fn<(error: RAGErrorRecord) => Promise<void>>();
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();
    const runtime = createRuntime({
      observer: {
        onEvent,
        onError,
        onTraceEnd,
      },
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
          };
        },
      },
      retriever: {
        async retrieve() {
          throw new Error('retriever failed');
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

    await expect(runtime.run({ query: 'fail here' })).rejects.toBeInstanceOf(RuntimeError);

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.run.fail',
        attributes: expect.objectContaining({
          outcome: 'failed',
          output: { stage: 'retrieval' },
          error: expect.objectContaining({
            name: 'RuntimeError',
            message: 'retriever failed',
          }),
        }),
      }),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'retrieval',
        name: 'runtime.run.fail',
        error: expect.objectContaining({
          name: 'RuntimeError',
          message: 'retriever failed',
        }),
      }),
    );
    expect(onTraceEnd).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });
});
