import { describe, expect, it } from 'vitest';

import type { RuntimeContext, RuntimeStrategyModel } from '../src/index.ts';
import {
  StrategyQueryPreprocessor,
  createQueryDecompositionStrategy,
  createQueryExpansionStrategy,
  createQueryRewriteStrategy,
  createMultiQueryStrategy,
  createQueryRoutingStrategy,
} from '../src/index.ts';
import {
  parseQueryList,
  parseRewrittenQuery,
} from '../src/stages/pre-retrieval/strategies/parse-strategy-model-text.ts';

const context: RuntimeContext = {
  requestId: 'req-1',
  input: { query: 'pgvector 是什么？' },
  options: {},
  startedAt: Date.now(),
};

function jsonModel(payload: unknown): RuntimeStrategyModel {
  return {
    async complete() {
      return JSON.stringify(payload);
    },
  };
}

describe('pre-retrieval LLM query strategies', () => {
  it('parses rewritten query from JSON, fenced JSON, or first line', () => {
    expect(parseRewrittenQuery('{"query":"向量检索"}')).toBe('向量检索');
    expect(parseRewrittenQuery('```json\n{"query":"向量检索"}\n```')).toBe('向量检索');
    expect(parseRewrittenQuery('向量检索扩展')).toBe('向量检索扩展');
  });

  it('parses query lists from JSON arrays and numbered lines', () => {
    expect(parseQueryList('{"queries":["a","b","a","c"]}', 3)).toEqual(['a', 'b', 'c']);
    expect(parseQueryList('1. alpha\n2. beta\n3. gamma', 2)).toEqual(['alpha', 'beta']);
  });

  it('rewrites effectiveQuery and keeps originalQuery', async () => {
    const preprocessor = new StrategyQueryPreprocessor({
      strategies: [
        createQueryRewriteStrategy({
          model: jsonModel({ query: 'PostgreSQL pgvector 向量扩展' }),
        }),
      ],
    });

    const request = await preprocessor.preprocess({ query: 'pgvector 是什么？' }, context);

    expect(request.originalQuery.query).toBe('pgvector 是什么？');
    expect(request.effectiveQuery.query).toBe('PostgreSQL pgvector 向量扩展');
    expect(request.rewriteReason).toBe('query-rewrite');
    expect(request.strategy).toBe('query-rewrite');
  });

  it('expands related queries and keeps the original first', async () => {
    const strategy = createQueryExpansionStrategy({
      model: jsonModel({
        queries: ['pgvector 与 PostgreSQL', '向量相似度检索'],
      }),
      count: 2,
    });

    const request = await strategy.apply(
      {
        originalQuery: { query: 'pgvector 是什么？' },
        effectiveQuery: { query: 'pgvector 是什么？' },
      },
      context,
    );

    expect(request.subQueries?.map((item) => item.query)).toEqual([
      'pgvector 是什么？',
      'pgvector 与 PostgreSQL',
      '向量相似度检索',
    ]);
    expect(request.strategy).toBe('query-expansion');
  });

  it('decomposes into sub-questions without the original by default', async () => {
    const strategy = createQueryDecompositionStrategy({
      model: jsonModel({
        queries: ['pgvector 是什么', '它和 PostgreSQL 的关系'],
      }),
    });

    const request = await strategy.apply(
      {
        originalQuery: { query: 'pgvector 是什么？它和 PostgreSQL 是什么关系？' },
        effectiveQuery: {
          query: 'pgvector 是什么？它和 PostgreSQL 是什么关系？',
        },
      },
      context,
    );

    expect(request.subQueries?.map((item) => item.query)).toEqual([
      'pgvector 是什么',
      '它和 PostgreSQL 的关系',
    ]);
    expect(request.strategy).toBe('query-decomposition');
  });

  it('generates multi-query paraphrases including the original', async () => {
    const strategy = createMultiQueryStrategy({
      model: jsonModel({
        queries: ['什么是 pgvector', 'pgvector 简介'],
      }),
      count: 2,
    });

    const request = await strategy.apply(
      {
        originalQuery: { query: 'pgvector 是什么？' },
        effectiveQuery: { query: 'pgvector 是什么？' },
      },
      context,
    );

    expect(request.subQueries?.map((item) => item.query)).toEqual([
      'pgvector 是什么？',
      '什么是 pgvector',
      'pgvector 简介',
    ]);
    expect(request.strategy).toBe('multi-query');
  });

  it('passthroughs when the model fails', async () => {
    const strategy = createQueryRewriteStrategy({
      model: {
        async complete() {
          throw new Error('model down');
        },
      },
    });

    const original = {
      originalQuery: { query: 'keep me' },
      effectiveQuery: { query: 'keep me' },
    };

    await expect(strategy.apply(original, context)).resolves.toEqual(original);
  });

  it('throws when onError is throw', async () => {
    const strategy = createQueryExpansionStrategy({
      model: {
        async complete() {
          throw new Error('model down');
        },
      },
      onError: 'throw',
    });

    await expect(
      strategy.apply(
        {
          originalQuery: { query: 'q' },
          effectiveQuery: { query: 'q' },
        },
        context,
      ),
    ).rejects.toThrow('model down');
  });

  it('routes query by writing request.route and request.budget.maxChunks', async () => {
    const strategy = createQueryRoutingStrategy({
      model: jsonModel({
        route: 'docs',
        topK: 2,
        budget: { maxPromptChars: 120 },
        filters: { metadata: { sourceId: 'docs/runtime' } },
      }),
    });

    const request = await strategy.apply(
      {
        originalQuery: { query: 'pgvector 是什么？' },
        effectiveQuery: { query: 'pgvector 是什么？' },
      },
      context,
    );

    expect(request.route).toBe('docs');
    expect(request.rewriteReason).toBe('query-routing');
    expect(request.budget?.maxChunks).toBe(2);
    expect(request.budget?.maxPromptChars).toBe(120);
    expect(request.filters?.metadata).toEqual(
      expect.objectContaining({ sourceId: 'docs/runtime' }),
    );
  });

  it('runs rewrite then expansion on the rewritten query', async () => {
    const preprocessor = new StrategyQueryPreprocessor({
      strategies: [
        createQueryRewriteStrategy({
          model: jsonModel({ query: 'rewritten' }),
        }),
        createQueryExpansionStrategy({
          model: {
            async complete(input) {
              expect(input.prompt).toContain('rewritten');
              return JSON.stringify({ queries: ['expanded'] });
            },
          },
          count: 1,
        }),
      ],
    });

    const request = await preprocessor.preprocess(
      { query: 'original' },
      {
        ...context,
        input: { query: 'original' },
      },
    );

    expect(request.effectiveQuery.query).toBe('rewritten');
    expect(request.subQueries?.map((item) => item.query)).toEqual(['rewritten', 'expanded']);
  });
});
