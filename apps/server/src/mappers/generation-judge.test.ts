import { describe, expect, it } from 'vitest';

import { toGenerationJudgeInput } from './generation-judge.js';

describe('toGenerationJudgeInput', () => {
  it('maps answer, contexts, groundingRefusal and golden generation fields', () => {
    const input = toGenerationJudgeInput(
      {
        id: 'q1',
        query: '退货时效是多久？',
        relevantSourceIds: ['return-policy'],
        expectedRefusal: false,
        referenceAnswer: '七日内可退。',
      },
      {
        answer: '七天内可退货。',
        chunks: [{ id: 'c1', content: '自签收之日起七日内可退货。', metadata: { sourceId: 'return-policy' } }],
        citations: [{ index: 1, chunkId: 'c1', sourceId: 'return-policy' }],
        originalQuery: { query: '退货时效是多久？' },
        effectiveQuery: { query: '退货时效是多久？' },
        generationMetadata: { groundingRefusal: false },
      },
    );

    expect(input).toEqual({
      sampleId: 'q1',
      query: '退货时效是多久？',
      answer: '七天内可退货。',
      contexts: [{ text: '自签收之日起七日内可退货。', sourceId: 'return-policy' }],
      refused: false,
      expectedRefusal: false,
      referenceAnswer: '七日内可退。',
    });
  });

  it('treats groundingRefusal true as refused even without citation sourceId', () => {
    const input = toGenerationJudgeInput(
      {
        id: 'q2',
        query: '天气怎么样？',
        relevantSourceIds: ['policy'],
        expectedRefusal: true,
      },
      {
        answer: '知识库中没有相关依据。',
        chunks: [],
        citations: [],
        originalQuery: { query: '天气怎么样？' },
        effectiveQuery: { query: '天气怎么样？' },
        generationMetadata: { groundingRefusal: true },
      },
    );

    expect(input.refused).toBe(true);
    expect(input.contexts).toEqual([]);
    expect(input.expectedRefusal).toBe(true);
  });
});
