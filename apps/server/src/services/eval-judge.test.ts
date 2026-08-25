import { describe, expect, it } from 'vitest';

import { runGenerationJudge } from './eval-judge.js';

const dataset = {
  name: 'demo',
  version: '1.0.0',
  samples: [
    {
      id: 'q1',
      query: '退货时效是多久？',
      relevantSourceIds: ['return-policy'],
      expectedRefusal: false,
    },
    {
      id: 'q2',
      query: '天气怎么样？',
      relevantSourceIds: ['policy'],
      expectedRefusal: true,
    },
  ],
};

describe('runGenerationJudge', () => {
  it('aggregates mocked judge JSON without calling the live LLM', async () => {
    const report = await runGenerationJudge(
      { dataset },
      {
        async runQuery(query) {
          if (query.includes('天气')) {
            return {
              answer: '知识库中没有相关依据。',
              chunks: [],
              citations: [],
              originalQuery: { query },
              effectiveQuery: { query },
              generationMetadata: { groundingRefusal: true },
            };
          }

          return {
            answer: '七天内可退货。',
            chunks: [
              {
                id: 'c1',
                content: '自签收之日起七日内可退货。',
                metadata: { sourceId: 'return-policy' },
              },
            ],
            citations: [{ index: 1, chunkId: 'c1', sourceId: 'return-policy' }],
            originalQuery: { query },
            effectiveQuery: { query },
          };
        },
        async completeJudge(_system, prompt) {
          if (prompt.includes('天气')) {
            return '{"faithfulness":0,"relevance":1}';
          }
          return '{"faithfulness":1,"relevance":0.5,"rationale":"有依据"}';
        },
      },
    );

    expect(report.dataset).toEqual({ name: 'demo', version: '1.0.0' });
    expect(report.samples).toHaveLength(2);
    expect(report.samples[0]).toMatchObject({
      sampleId: 'q1',
      faithfulness: 1,
      relevance: 0.5,
      refusalCorrectness: 1,
      unscorable: false,
      rationale: '有依据',
    });
    expect(report.samples[1]).toMatchObject({
      sampleId: 'q2',
      faithfulness: null,
      relevance: 1,
      refusalCorrectness: 1,
      refused: true,
    });
    expect(report.aggregate.scoredSampleCount).toBe(2);
    expect(report.aggregate.meanFaithfulness).toBe(1);
    expect(report.aggregate.meanRelevance).toBe(0.75);
    expect(report.aggregate.meanRefusalCorrectness).toBe(1);
    expect(report.aggregate.unscorableSampleIds).toEqual([]);
  });

  it('isolates a failed judge call so the rest of the batch still scores', async () => {
    const report = await runGenerationJudge(
      { dataset },
      {
        async runQuery(query) {
          return {
            answer: query.includes('天气') ? '拒答' : '七天',
            chunks: query.includes('天气')
              ? []
              : [{ id: 'c1', content: '七日内可退', metadata: { sourceId: 'return-policy' } }],
            citations: [],
            originalQuery: { query },
            effectiveQuery: { query },
            generationMetadata: { groundingRefusal: query.includes('天气') },
          };
        },
        async completeJudge(_system, prompt) {
          if (prompt.includes('天气')) {
            throw new Error('model timeout');
          }
          return '{"faithfulness":0.8,"relevance":0.8}';
        },
      },
    );

    expect(report.samples[0]?.unscorable).toBe(false);
    expect(report.samples[1]?.parseError).toBe('model timeout');
    expect(report.samples[1]?.refusalCorrectness).toBe(1);
    expect(report.aggregate.scoredSampleCount).toBe(2);
  });
});
