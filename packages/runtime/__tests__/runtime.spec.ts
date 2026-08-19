import { describe, expect, it } from 'vitest';

import { RAGResponseSchema } from '@monai-ragsdk/core';

import { RuntimeError, createDefaultRuntime, createRuntime } from '../src/index.ts';

describe('runtime pipeline', () => {
  it('runs the minimal four-stage flow', async () => {
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve(request) {
          return {
            candidates: [
              {
                chunk: {
                  id: 'chunk-1',
                  content: `retrieved for: ${request.effectiveQuery.query}`,
                },
                score: 0.95,
              },
            ],
            retrievalMetadata: {
              provider: 'unit-test',
            },
          };
        },
      },
      generator: {
        async generate({ request, chunks }) {
          return {
            answer: `${request.effectiveQuery.query} -> ${chunks[0]?.content ?? 'no chunk'}`,
            generationMetadata: {
              provider: 'unit-test',
            },
          };
        },
      },
    });

    await expect(runtime.run({ query: 'Explain runtime contract' })).resolves.toMatchObject({
      answer: 'Explain runtime contract -> retrieved for: Explain runtime contract',
      chunks: [
        {
          id: 'chunk-1',
          content: 'retrieved for: Explain runtime contract',
        },
      ],
      originalQuery: { query: 'Explain runtime contract' },
      effectiveQuery: { query: 'Explain runtime contract' },
      retrievalMetadata: {
        provider: 'unit-test',
      },
      generationMetadata: {
        provider: 'unit-test',
      },
      citations: [
        {
          index: 1,
          chunkId: 'chunk-1',
          score: 0.95,
        },
      ],
    });
  });

  it('generates opaque UUID ids and only reuses an explicit requestId as traceId', async () => {
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve() {
          return {
            candidates: [{ chunk: { id: 'chunk-1', content: 'c' }, score: 1 }],
          };
        },
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    const generated = await runtime.run({ query: 'hello?' });
    expect(generated.requestId).not.toContain('hello');
    expect(generated.traceId).not.toContain('hello');
    expect(generated.requestId).not.toBe(generated.traceId);

    const reused = await runtime.run({ query: 'hello?' }, { requestId: 'req-from-gateway' });
    expect(reused.requestId).toBe('req-from-gateway');
    expect(reused.traceId).toBe('req-from-gateway');

    const provided = await runtime.run(
      { query: 'hello?' },
      { requestId: 'req-from-gateway', trace: { traceId: 'trace-from-parent' } },
    );
    expect(provided.requestId).toBe('req-from-gateway');
    expect(provided.traceId).toBe('trace-from-parent');
  });

  it('search runs retrieve-only and never calls the generator', async () => {
    let generateCalls = 0;
    const observerEvents: string[] = [];

    const runtime = createDefaultRuntime({
      observer: {
        onEvent(event) {
          observerEvents.push(event.name);
        },
      },
      retriever: {
        async retrieve(request) {
          return {
            candidates: [
              {
                chunk: {
                  id: 'chunk-1',
                  content: `retrieved for: ${request.effectiveQuery.query}`,
                },
                score: 0.95,
              },
            ],
            retrievalMetadata: {
              provider: 'unit-test',
            },
          };
        },
      },
      generator: {
        async generate() {
          generateCalls += 1;
          throw new Error('search must not call generate()');
        },
      },
    });

    const result = await runtime.search(
      { query: 'Explain runtime contract' },
      { includeDebug: true },
    );

    expect(generateCalls).toBe(0);
    expect(result).not.toHaveProperty('answer');
    expect(result).not.toHaveProperty('streamed');
    expect(result).not.toHaveProperty('generationMetadata');
    expect(result.chunks).toEqual([
      {
        id: 'chunk-1',
        content: 'retrieved for: Explain runtime contract',
      },
    ]);
    expect(result.citations).toEqual([
      {
        index: 1,
        chunkId: 'chunk-1',
        score: 0.95,
      },
    ]);
    expect(result.originalQuery).toEqual({ query: 'Explain runtime contract' });
    expect(result.effectiveQuery).toEqual({
      query: 'Explain runtime contract',
    });
    expect(result.retrievalMetadata).toEqual({ provider: 'unit-test' });
    expect(result.counts).toEqual({
      retrieved: 1,
      selected: 1,
      dropped: 0,
      finalChunks: 1,
    });
    expect(result.timings).not.toHaveProperty('generation');
    expect(result.debug?.finalChunkCount).toBe(1);
    expect(observerEvents).not.toContain('runtime.generation.start');
    expect(observerEvents).toContain('runtime.search.complete');
  });

  it('returns debug info when includeDebug is enabled', async () => {
    const runtime = createRuntime({
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: `${input.query} site:runtime` },
            route: 'runtime-docs',
            rewriteReason: 'prefer runtime docs',
            strategy: 'metadata-first',
            indexingMode: 'incremental',
            filters: {
              sourceIds: ['docs/runtime'],
              hierarchyPaths: ['runtime/api'],
            },
            budget: {
              maxCandidates: 4,
              maxChunks: 1,
            },
            rerank: {
              strategy: 'score-threshold',
              minScore: 0.7,
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
                  content: `retrieved for: ${request.effectiveQuery.query}`,
                },
                score: 0.91,
                sourceId: 'docs/runtime',
                hierarchyPath: 'runtime/api',
              },
              {
                chunk: {
                  id: 'chunk-2',
                  content: `secondary for: ${request.effectiveQuery.query}`,
                },
                score: 0.5,
                sourceId: 'docs/runtime',
                hierarchyPath: 'runtime/api',
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
            appliedBudget: {
              maxCandidates: 4,
              maxChunks: 1,
            },
            appliedScoreThreshold: 0.7,
            promptContext: `query: Explain debug mode\n\n${candidates[0]!.chunk.content}`,
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

    const result = await runtime.run({ query: 'Explain debug mode' }, { includeDebug: true });

    expect(result.debug).toMatchObject({
      route: 'runtime-docs',
      rewriteReason: 'prefer runtime docs',
      retrievalStrategy: 'metadata-first',
      rerankStrategy: 'score-threshold',
      indexingMode: 'incremental',
      filters: {
        sourceIds: ['docs/runtime'],
        hierarchyPaths: ['runtime/api'],
      },
      retrievedCount: 2,
      selectedCount: 1,
      droppedCount: 1,
      finalChunkCount: 1,
      appliedBudget: {
        maxCandidates: 4,
        maxChunks: 1,
      },
      appliedScoreThreshold: 0.7,
      promptContext: 'query: Explain debug mode\n\nretrieved for: Explain debug mode site:runtime',
    });
    expect(result.debug?.timings.total).toBeTypeOf('number');
    expect(result.streamed).toBe(false);
    expect(result.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.requestId).not.toContain('Explain debug mode');
    expect(result.traceId).not.toContain('Explain debug mode');
    expect(result.requestId).not.toBe(result.traceId);
    expect(result.startedAt).toBeTypeOf('number');
    expect(result.endedAt).toBeTypeOf('number');
    expect(result.counts).toEqual({
      retrieved: 2,
      selected: 1,
      dropped: 1,
      finalChunks: 1,
    });
    expect(result.filters).toMatchObject({
      sourceIds: ['docs/runtime'],
      hierarchyPaths: ['runtime/api'],
    });
    expect(result.budget).toEqual({
      maxCandidates: 4,
      maxChunks: 1,
    });
    expect(result.appliedBudget).toEqual({
      maxCandidates: 4,
      maxChunks: 1,
    });
    expect(result.rerank).toEqual({
      strategy: 'score-threshold',
      minScore: 0.7,
    });
    expect(result.droppedChunkIds).toEqual(['chunk-2']);
    expect(result.retrievedCandidates).toEqual([
      {
        chunkId: 'chunk-1',
        score: 0.91,
        sourceId: 'docs/runtime',
      },
      {
        chunkId: 'chunk-2',
        score: 0.5,
        sourceId: 'docs/runtime',
      },
    ]);

    const { debug: _debug, ...snapshot } = result;
    expect(RAGResponseSchema.parse(snapshot).counts).toEqual(result.counts);
  });

  it('wraps stage failures as RuntimeError', async () => {
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
    await expect(runtime.run({ query: 'fail here' })).rejects.toMatchObject({
      stage: 'retrieval',
      originalQuery: { query: 'fail here' },
      effectiveQuery: { query: 'fail here' },
      cause: expect.any(Error),
    });
  });

  it('streams generation deltas then a final result', async () => {
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve(request) {
          return {
            candidates: [
              {
                chunk: {
                  id: 'chunk-1',
                  content: `retrieved for: ${request.effectiveQuery.query}`,
                },
              },
            ],
          };
        },
      },
      generator: {
        async generate({ request }) {
          return {
            answer: `full:${request.effectiveQuery.query}`,
          };
        },
        async *generateStream({ request }) {
          yield { type: 'delta' as const, text: 'hello ' };
          yield { type: 'delta' as const, text: 'world' };
          yield {
            type: 'complete' as const,
            result: {
              answer: 'hello world',
              generationMetadata: {
                provider: 'unit-test',
                query: request.effectiveQuery.query,
              },
            },
          };
        },
      },
    });

    const events = [];
    for await (const event of runtime.runStream({
      query: 'Explain runtime contract',
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'delta', text: 'hello ' },
      { type: 'delta', text: 'world' },
      {
        type: 'result',
        result: expect.objectContaining({
          answer: 'hello world',
          originalQuery: { query: 'Explain runtime contract' },
          generationMetadata: {
            provider: 'unit-test',
            query: 'Explain runtime contract',
          },
          citations: [
            {
              index: 1,
              chunkId: 'chunk-1',
            },
          ],
        }),
      },
    ]);
  });

  it('falls back to a single delta when generateStream is absent', async () => {
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: { id: 'chunk-1', content: 'ctx' },
              },
            ],
          };
        },
      },
      generator: {
        async generate() {
          return {
            answer: 'one-shot answer',
            generationMetadata: { provider: 'unit-test' },
          };
        },
      },
    });

    const events = [];
    for await (const event of runtime.runStream({ query: 'fallback' })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'delta', text: 'one-shot answer' },
      {
        type: 'result',
        result: expect.objectContaining({
          answer: 'one-shot answer',
          generationMetadata: { provider: 'unit-test' },
          citations: [
            {
              index: 1,
              chunkId: 'chunk-1',
            },
          ],
        }),
      },
    ]);
  });

  it('wraps streamed generation failures as RuntimeError', async () => {
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve() {
          return { candidates: [] };
        },
      },
      generator: {
        async generate() {
          return { answer: 'never' };
        },
        async *generateStream() {
          yield { type: 'delta' as const, text: 'partial' };
          throw new Error('stream failed');
        },
      },
    });

    const deltas: string[] = [];

    await expect(async () => {
      for await (const event of runtime.runStream({ query: 'fail stream' })) {
        if (event.type === 'delta') {
          deltas.push(event.text);
        }
      }
    }).rejects.toMatchObject({
      stage: 'generation',
      originalQuery: { query: 'fail stream' },
    });

    expect(deltas).toEqual(['partial']);
  });

  it('builds citations from selected candidates for both run and runStream', async () => {
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: {
                  id: 'chunk-api',
                  content: 'runtime api',
                  metadata: {
                    sourceId: 'docs/runtime',
                    documentTitle: 'Runtime API',
                    hierarchyPath: ['runtime', 'api'],
                  },
                },
                score: 0.93,
                sourceId: 'docs/runtime',
                hierarchyPath: 'runtime/api',
              },
            ],
          };
        },
      },
      generator: {
        async generate() {
          return { answer: 'grounded answer' };
        },
      },
    });
    const expectedCitations = [
      {
        index: 1,
        chunkId: 'chunk-api',
        sourceId: 'docs/runtime',
        score: 0.93,
        title: 'Runtime API',
        hierarchyPath: 'runtime/api',
      },
    ];

    await expect(runtime.run({ query: 'cite me' })).resolves.toMatchObject({
      answer: 'grounded answer',
      citations: expectedCitations,
    });

    let streamedResult;
    for await (const event of runtime.runStream({ query: 'cite me' })) {
      if (event.type === 'result') {
        streamedResult = event.result;
      }
    }

    expect(streamedResult?.citations).toEqual(expectedCitations);
  });

  it('falls back to chunk metadata when selectedCandidates are absent', async () => {
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
          return { candidates: [] };
        },
      },
      postprocessor: {
        async postprocess() {
          return {
            chunks: [
              {
                id: 'chunk-meta',
                content: 'from metadata',
                metadata: {
                  sourceId: 'docs/faq',
                  title: 'FAQ',
                  hierarchyPath: ['runtime', 'faq'],
                },
              },
            ],
          };
        },
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    await expect(runtime.run({ query: 'meta cite' })).resolves.toMatchObject({
      citations: [
        {
          index: 1,
          chunkId: 'chunk-meta',
          sourceId: 'docs/faq',
          title: 'FAQ',
          hierarchyPath: 'runtime/faq',
        },
      ],
    });
  });

  it('returns an empty citations array when no chunks grounded the answer', async () => {
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve() {
          return { candidates: [] };
        },
      },
      generator: {
        async generate() {
          return { answer: 'no context' };
        },
      },
    });

    await expect(runtime.run({ query: 'empty' })).resolves.toMatchObject({
      chunks: [],
      citations: [],
    });
  });
});
