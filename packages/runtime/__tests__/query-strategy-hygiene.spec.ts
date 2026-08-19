import { describe, expect, it, vi } from 'vitest';

import type { RetrievalRequest } from '../src/index.ts';

import {
  StrategyQueryPreprocessor,
  createQueryRewriteStrategy,
  createQueryRoutingStrategy,
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

describe('query strategy hygiene', () => {
  it('does not treat strategy-only edits as passthrough', () => {
    expect(
      isQueryStrategyPassthrough(baseRequest, {
        ...baseRequest,
        strategy: 'query-rewrite',
      }),
    ).toBe(false);
  });

  it('omits passthrough strategies from appliedStrategies', async () => {
    const preprocessor = new StrategyQueryPreprocessor({
      strategies: [
        {
          name: 'query-rewrite',
          async apply(request) {
            return {
              ...request,
              effectiveQuery: { query: 'rewritten' },
            };
          },
        },
        {
          name: 'noop',
          async apply(request) {
            return request;
          },
        },
      ],
    });

    const request = await preprocessor.preprocess({ query: 'q' }, context);
    expect(request.appliedStrategies).toEqual(['query-rewrite']);
  });

  it('does not write rewriteReason when routing cannot determine a route', async () => {
    const strategy = createQueryRoutingStrategy({
      model: {
        async complete() {
          return JSON.stringify({ topK: 2 });
        },
      },
    });

    const request = await strategy.apply(baseRequest, context);
    expect(request.rewriteReason).toBeUndefined();
    expect(request.route).toBeUndefined();
    expect(request.budget).toBeUndefined();
  });

  it('does not call the model for a blank query', async () => {
    const complete = vi.fn(async () => JSON.stringify({ query: 'should-not-run' }));
    const strategy = createQueryRewriteStrategy({
      model: { complete },
    });

    const request = await strategy.apply(
      {
        originalQuery: { query: '   ' },
        effectiveQuery: { query: '   ' },
      },
      context,
    );

    expect(complete).not.toHaveBeenCalled();
    expect(request.effectiveQuery.query).toBe('   ');
  });
});
