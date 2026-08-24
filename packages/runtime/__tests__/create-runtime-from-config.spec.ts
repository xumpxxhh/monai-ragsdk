import { describe, expect, it } from 'vitest';

import type { RetrievalRequest } from '../src/index.ts';

import {
  FanOutRetriever,
  POST_RETRIEVAL_ASSEMBLY_ORDER,
  assemblePostRetrievalStrategies,
  createLlmRerankStrategy,
  createLostInTheMiddleStrategy,
  createRuntimeFromConfig,
  createScoreThresholdStrategy,
} from '../src/index.ts';

describe('createRuntimeFromConfig', () => {
  it('places explicit rerank before the default score-threshold', () => {
    const names = assemblePostRetrievalStrategies({
      scoreThreshold: 0.2,
      rerank: createLlmRerankStrategy({
        model: {
          async complete() {
            return '{"ranked":[]}';
          },
        },
      }),
    }).map((strategy) => strategy.name);

    expect(names[0]).toBe('llm-rerank');
    expect(names.indexOf('llm-rerank')).toBeLessThan(names.indexOf('score-threshold'));
    expect(POST_RETRIEVAL_ASSEMBLY_ORDER[0]).toBe('llm-rerank');
    expect(POST_RETRIEVAL_ASSEMBLY_ORDER[1]).toBe('score-threshold');
  });

  it('does not insert llm-rerank unless it is configured', () => {
    const names = assemblePostRetrievalStrategies({ scoreThreshold: 0.2 }).map(
      (strategy) => strategy.name,
    );

    expect(names).not.toContain('llm-rerank');
    expect(names[0]).toBe('score-threshold');
  });

  it('keeps a strategies override in caller order', () => {
    const names = assemblePostRetrievalStrategies({
      strategies: [
        createScoreThresholdStrategy({ scoreThreshold: 0.1 }),
        createLostInTheMiddleStrategy(),
      ],
    }).map((strategy) => strategy.name);

    expect(names).toEqual(['score-threshold', 'lost-in-the-middle']);
  });

  it('wraps the retriever in FanOut so subQueries are retrieved separately', async () => {
    const queries: string[] = [];
    const runtime = createRuntimeFromConfig({
      query: {
        strategies: [
          {
            name: 'seed-sub-queries',
            async apply(request) {
              return {
                ...request,
                subQueries: [{ query: 'alpha' }, { query: 'beta' }],
              };
            },
          },
        ],
      },
      retriever: {
        async retrieve(request: RetrievalRequest) {
          queries.push(request.effectiveQuery.query);
          return {
            candidates: [
              {
                chunk: { id: request.effectiveQuery.query, content: request.effectiveQuery.query },
                score: 1,
                scoreKind: 'retriever',
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

    await runtime.run({ query: 'original' });
    expect(queries).toEqual(['alpha', 'beta']);
  });

  it('does not wrap an existing FanOutRetriever', async () => {
    const queries: string[] = [];
    const inner = {
      async retrieve(request: RetrievalRequest) {
        queries.push(request.effectiveQuery.query);
        return { candidates: [] };
      },
    };
    const runtime = createRuntimeFromConfig({
      retriever: new FanOutRetriever({ retriever: inner }),
      query: {
        strategies: [
          {
            name: 'seed-sub-queries',
            async apply(request) {
              return {
                ...request,
                subQueries: [{ query: 'alpha' }, { query: 'beta' }],
              };
            },
          },
        ],
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    await runtime.run({ query: 'original' });
    expect(queries).toEqual(['alpha', 'beta']);
  });

  it('skips FanOut when fanOut is false', async () => {
    const queries: string[] = [];
    const runtime = createRuntimeFromConfig({
      fanOut: false,
      query: {
        strategies: [
          {
            name: 'seed-sub-queries',
            async apply(request) {
              return {
                ...request,
                subQueries: [{ query: 'alpha' }, { query: 'beta' }],
              };
            },
          },
        ],
      },
      retriever: {
        async retrieve(request: RetrievalRequest) {
          queries.push(request.effectiveQuery.query);
          return { candidates: [] };
        },
      },
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    await runtime.run({ query: 'original' });
    expect(queries).toEqual(['original']);
  });
});
