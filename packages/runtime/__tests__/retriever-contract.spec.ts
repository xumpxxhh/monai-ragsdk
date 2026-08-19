import { describe, expect, it, vi } from 'vitest';

import { FanOutRetriever, createDefaultRuntime } from '../src/index.ts';
import { enforceRetrievalRequestFilters } from '../src/contract/index.ts';

describe('runtime retriever contract', () => {
  it('enforces request.filters after retrieve even if the retriever ignores them', async () => {
    const runtime = createDefaultRuntime({
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
            filters: { sourceIds: ['docs/a'] },
          };
        },
      },
      retriever: {
        id: 'stub',
        async retrieve() {
          return {
            candidates: [
              {
                chunk: { id: 'a', content: 'keep' },
                sourceId: 'docs/a',
              },
              {
                chunk: { id: 'b', content: 'drop' },
                sourceId: 'docs/b',
              },
            ],
          };
        },
      },
      generator: {
        async generate({ chunks }) {
          return { answer: chunks.map((chunk) => chunk.id).join(',') };
        },
      },
    });

    const result = await runtime.run({ query: 'hello' });

    expect(result.chunks.map((chunk) => chunk.id)).toEqual(['a']);
    expect(result.answer).toBe('a');
    expect(result.retrievalMetadata).toMatchObject({
      requestFiltersEnforced: true,
      candidateCountBeforeRequestFilters: 2,
    });
  });

  it('does not rewrite retrievalMetadata when filters already match', () => {
    const result = enforceRetrievalRequestFilters(
      {
        candidates: [
          {
            chunk: { id: 'a', content: 'keep' },
            sourceId: 'docs/a',
          },
        ],
        retrievalMetadata: { provider: 'unit-test' },
      },
      { sourceIds: ['docs/a'] },
    );

    expect(result.retrievalMetadata).toEqual({ provider: 'unit-test' });
    expect(result.candidates[0]?.matchedFilters).toEqual(['sourceIds']);
  });

  it('closes nested fan-out retrievers from runtime.close', async () => {
    const closeInner = vi.fn(async () => undefined);
    const fanOut = new FanOutRetriever({
      id: 'fanout-main',
      retriever: {
        id: 'inner',
        capabilities: { searchTypes: ['vector'] },
        async retrieve() {
          return { candidates: [] };
        },
        close: closeInner,
      },
    });

    expect(fanOut.name).toBe('fan-out');
    expect(fanOut.id).toBe('fanout-main');
    expect(fanOut.capabilities).toEqual({ searchTypes: ['vector'] });

    const runtime = createDefaultRuntime({
      retriever: fanOut,
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    await runtime.close();
    expect(closeInner).toHaveBeenCalledTimes(1);
  });
});
