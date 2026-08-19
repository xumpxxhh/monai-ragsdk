import { describe, expect, it } from 'vitest';

import type { RetrievalRequest } from '../src/index.ts';

import {
  NoopQueryPreprocessor,
  applyRetrievalTopKAlias,
  createDefaultRuntime,
} from '../src/index.ts';

function dummyContext() {
  return {
    requestId: 'test',
    input: { query: 'q' },
    options: {},
    startedAt: Date.now(),
  };
}

describe('retrieval topK alias', () => {
  it('fills maxChunks only when the authoritative field is missing', () => {
    const request: RetrievalRequest = {
      originalQuery: { query: 'q' },
      effectiveQuery: { query: 'q' },
      topK: 5,
    };

    expect(applyRetrievalTopKAlias(request).budget?.maxChunks).toBe(5);
  });

  it('does not overwrite an existing maxChunks', () => {
    const request: RetrievalRequest = {
      originalQuery: { query: 'q' },
      effectiveQuery: { query: 'q' },
      topK: 8,
      budget: { maxChunks: 2, maxPromptChars: 100 },
    };

    expect(applyRetrievalTopKAlias(request)).toEqual(request);
  });

  it('passes topK-only requests into retrieve with maxChunks filled', async () => {
    let seen: RetrievalRequest | undefined;
    const runtime = createDefaultRuntime({
      preprocessor: {
        async preprocess() {
          return {
            originalQuery: { query: 'q' },
            effectiveQuery: { query: 'q' },
            topK: 4,
          };
        },
      },
      retriever: {
        async retrieve(request) {
          seen = request;
          return { candidates: [] };
        },
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    await runtime.run({ query: 'q' });

    expect(seen?.topK).toBe(4);
    expect(seen?.budget?.maxChunks).toBe(4);
  });

  it('reports audit topK from maxChunks when the alias disagrees', async () => {
    const runtime = createDefaultRuntime({
      preprocessor: new NoopQueryPreprocessor({
        topK: 8,
        budget: { maxChunks: 2 },
      }),
      retriever: {
        async retrieve() {
          return { candidates: [] };
        },
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    const result = await runtime.search({ query: 'q' });

    expect(result.topK).toBe(2);
    expect(result.budget?.maxChunks).toBe(2);
  });

  it('is a no-op when topK is absent', async () => {
    const preprocessor = new NoopQueryPreprocessor();
    const request = await preprocessor.preprocess({ query: 'q' }, dummyContext());
    expect(request.budget).toBeUndefined();
    expect(request.topK).toBeUndefined();
  });
});
