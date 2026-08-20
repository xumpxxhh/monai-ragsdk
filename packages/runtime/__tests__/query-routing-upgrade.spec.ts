import { describe, expect, it, vi } from 'vitest';

import type { RetrievalRequest, RuntimeGeneratorInput, RuntimeRetriever } from '../src/index.ts';

import {
  FanOutRetriever,
  createDefaultRuntime,
  createQueryRoutingStrategy,
  createRuleBasedRoutingStrategy,
} from '../src/index.ts';
import { isQueryStrategyPassthrough } from '../src/observation/emit-runtime-observation.ts';

const context = {
  requestId: 'req-1',
  input: { query: 'q' },
  options: {},
  startedAt: Date.now(),
};

const baseRequest: RetrievalRequest = {
  originalQuery: { query: 'q' },
  effectiveQuery: { query: 'q' },
};

function stubRetriever(
  id: string,
  retrieve: RuntimeRetriever['retrieve'] = async () => ({
    candidates: [{ chunk: { id, content: id } }],
  }),
): RuntimeRetriever {
  return { id, retrieve };
}

describe('query routing upgrade', () => {
  it('skips child retrieve and labels grounding as skipped', async () => {
    const retrieveA = vi.fn(async () => ({
      candidates: [{ chunk: { id: 'a', content: 'a' } }],
    }));
    let received: RuntimeGeneratorInput | undefined;

    const runtime = createDefaultRuntime({
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
            routeDecision: { retrievalMode: 'skip' },
          };
        },
      },
      retriever: new FanOutRetriever({
        retrievers: [stubRetriever('a', retrieveA), stubRetriever('b')],
      }),
      generator: {
        async generate(input) {
          received = input;
          return { answer: 'skipped' };
        },
      },
    });

    await runtime.run({ query: 'hello' });

    expect(retrieveA).not.toHaveBeenCalled();
    expect(received?.chunks).toEqual([]);
    expect(received?.grounding).toEqual({ chunksEmptyReason: 'skipped' });
  });

  it('rule skip does not call nested retrievers', async () => {
    const retrieve = vi.fn(async () => ({
      candidates: [{ chunk: { id: 'hit', content: 'hit' } }],
    }));
    const strategy = createRuleBasedRoutingStrategy({
      rules: [
        {
          name: 'skip-all',
          match: () => true,
          decision: { retrievalMode: 'skip' },
        },
      ],
    });

    const request = await strategy.apply(baseRequest, context);
    expect(request.routeDecision).toEqual({ retrievalMode: 'skip' });
    expect(request.rewriteReason).toBe('query-routing');

    const runtime = createDefaultRuntime({
      preprocessor: {
        async preprocess() {
          return request;
        },
      },
      retriever: new FanOutRetriever({ retriever: stubRetriever('a', retrieve) }),
      generator: {
        async generate() {
          return { answer: 'ok' };
        },
      },
    });

    const result = await runtime.run({ query: 'q' });
    expect(retrieve).not.toHaveBeenCalled();
    expect(result.retrievedCandidates).toEqual([]);
  });

  it('only retrieves the targeted retriever id', async () => {
    const retrieveA = vi.fn(async () => ({
      candidates: [{ chunk: { id: 'a', content: 'a' } }],
    }));
    const retrieveB = vi.fn(async () => ({
      candidates: [{ chunk: { id: 'b', content: 'b' } }],
    }));

    const fanOut = new FanOutRetriever({
      retrievers: [stubRetriever('a', retrieveA), stubRetriever('b', retrieveB)],
    });

    const result = await fanOut.retrieve(
      {
        ...baseRequest,
        routeDecision: { targets: ['b'] },
      },
      context,
    );

    expect(retrieveA).not.toHaveBeenCalled();
    expect(retrieveB).toHaveBeenCalledTimes(1);
    expect(result.candidates.map((candidate) => candidate.chunk.id)).toEqual(['b']);
  });

  it('does not fall back to retrievers[0] when no targets match', async () => {
    const retrieveA = vi.fn(async () => ({
      candidates: [{ chunk: { id: 'a', content: 'a' } }],
    }));
    const retrieveB = vi.fn(async () => ({
      candidates: [{ chunk: { id: 'b', content: 'b' } }],
    }));

    const fanOut = new FanOutRetriever({
      retrievers: [stubRetriever('a', retrieveA), stubRetriever('b', retrieveB)],
    });

    const result = await fanOut.retrieve(
      {
        ...baseRequest,
        routeDecision: { targets: ['missing'] },
      },
      context,
    );

    expect(retrieveA).not.toHaveBeenCalled();
    expect(retrieveB).not.toHaveBeenCalled();
    expect(result.candidates).toEqual([]);
    expect(result.retrievalMetadata).toMatchObject({
      skipped: true,
      skipReason: 'targets-unmatched',
    });
  });

  it('keeps calling only the first retriever when routeDecision is absent', async () => {
    const retrieveA = vi.fn(async () => ({
      candidates: [{ chunk: { id: 'a', content: 'a' } }],
    }));
    const retrieveB = vi.fn(async () => ({
      candidates: [{ chunk: { id: 'b', content: 'b' } }],
    }));

    const fanOut = new FanOutRetriever({
      retrievers: [stubRetriever('a', retrieveA), stubRetriever('b', retrieveB)],
    });

    const result = await fanOut.retrieve(baseRequest, context);

    expect(retrieveA).toHaveBeenCalledTimes(1);
    expect(retrieveB).not.toHaveBeenCalled();
    expect(result.candidates.map((candidate) => candidate.chunk.id)).toEqual(['a']);
  });

  it('createQueryRoutingStrategy still writes route and budget', async () => {
    const strategy = createQueryRoutingStrategy({
      model: {
        async complete() {
          return JSON.stringify({
            route: 'docs',
            topK: 2,
            budget: { maxPromptChars: 80 },
          });
        },
      },
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
    expect(request.budget).toEqual({ maxChunks: 2, maxPromptChars: 80 });
  });

  it('does not treat routeDecision-only edits as passthrough', () => {
    expect(
      isQueryStrategyPassthrough(baseRequest, {
        ...baseRequest,
        routeDecision: { searchType: 'vector' },
      }),
    ).toBe(false);
  });
});
