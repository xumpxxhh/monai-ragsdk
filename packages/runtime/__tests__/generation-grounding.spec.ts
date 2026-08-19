import { describe, expect, it } from 'vitest';

import type { RuntimeGeneratorInput } from '../src/index.ts';

import { createDefaultRuntime, resolveGenerationGrounding } from '../src/index.ts';

describe('generation grounding', () => {
  it('does not attach grounding when chunks remain', () => {
    expect(
      resolveGenerationGrounding({
        retrievedCount: 2,
        chunkCount: 1,
      }),
    ).toBeUndefined();
  });

  it('labels empty chunks as no-hits when retrieval also returned nothing', () => {
    expect(resolveGenerationGrounding({ retrievedCount: 0, chunkCount: 0 })).toEqual({
      chunksEmptyReason: 'no-hits',
    });
  });

  it('labels empty chunks as filtered when retrieval had candidates', () => {
    expect(resolveGenerationGrounding({ retrievedCount: 3, chunkCount: 0 })).toEqual({
      chunksEmptyReason: 'filtered',
    });
  });

  it('prefers skipped over no-hits so an intentional skip is not a miss', () => {
    expect(
      resolveGenerationGrounding({
        retrievedCount: 0,
        chunkCount: 0,
        retrievalSkipped: true,
      }),
    ).toEqual({
      chunksEmptyReason: 'skipped',
    });
  });

  it('passes no-hits into generate when retrieval is empty', async () => {
    let received: RuntimeGeneratorInput | undefined;
    const runtime = createDefaultRuntime({
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
        async generate(input) {
          received = input;
          return { answer: 'no evidence' };
        },
      },
    });

    await runtime.run({ query: 'hello' });

    expect(received?.chunks).toEqual([]);
    expect(received?.grounding).toEqual({ chunksEmptyReason: 'no-hits' });
  });

  it('passes filtered into generate when post-retrieval drops every candidate', async () => {
    let received: RuntimeGeneratorInput | undefined;
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: { id: 'chunk-1', content: 'low' },
                score: 0.1,
                scoreKind: 'retriever',
              },
            ],
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return {
            chunks: [],
            selectedCandidates: [],
            droppedCandidates: candidates,
          };
        },
      },
      generator: {
        async generate(input) {
          received = input;
          return { answer: 'filtered out' };
        },
      },
    });

    await runtime.run({ query: 'hello' });

    expect(received?.grounding).toEqual({ chunksEmptyReason: 'filtered' });
  });

  it('omits grounding when generation still has chunks', async () => {
    let received: RuntimeGeneratorInput | undefined;
    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve() {
          return {
            candidates: [{ chunk: { id: 'chunk-1', content: 'kept' }, scoreKind: 'retriever' }],
          };
        },
      },
      generator: {
        async generate(input) {
          received = input;
          return { answer: 'ok' };
        },
      },
    });

    await runtime.run({ query: 'hello' });

    expect(received?.chunks).toHaveLength(1);
    expect(received).not.toHaveProperty('grounding');
  });

  it('passes the same grounding into generateStream', async () => {
    let received: RuntimeGeneratorInput | undefined;
    const runtime = createDefaultRuntime({
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
          return { answer: 'unused' };
        },
        async *generateStream(input) {
          received = input;
          yield { type: 'delta' as const, text: 'skip-ok' };
          yield {
            type: 'complete' as const,
            result: { answer: 'skip-ok' },
          };
        },
      },
    });

    for await (const _event of runtime.runStream({ query: 'hello' })) {
      // drain
    }

    expect(received?.grounding).toEqual({ chunksEmptyReason: 'no-hits' });
  });
});
