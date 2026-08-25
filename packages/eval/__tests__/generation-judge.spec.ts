import { describe, expect, it } from 'vitest';

import {
  aggregateGenerationJudgeScores,
  buildGenerationJudgePrompt,
  GENERATION_JUDGE_SYSTEM_PROMPT,
  parseEvalDataset,
  scoreGenerationJudgeSample,
  scoreRefusalCorrectness,
} from '../src/index.ts';
import type { GenerationJudgeInput } from '../src/index.ts';

function groundedInput(
  overrides: Partial<GenerationJudgeInput> = {},
): GenerationJudgeInput {
  return {
    sampleId: 'q1',
    query: '退货时效是多久？',
    answer: '七天内可退货。',
    contexts: [{ sourceId: 'return-policy', text: '自签收之日起七日内可退货。' }],
    refused: false,
    ...overrides,
  };
}

describe('EvalSample generation fields', () => {
  it('accepts optional expectedRefusal and referenceAnswer', () => {
    const dataset = parseEvalDataset({
      name: 'demo',
      version: '1.0.0',
      samples: [
        {
          id: 'q1',
          query: '退货时效是多久？',
          relevantSourceIds: ['return-policy'],
          expectedRefusal: false,
          referenceAnswer: '七天内可退。',
        },
      ],
    });

    expect(dataset.samples[0]?.expectedRefusal).toBe(false);
    expect(dataset.samples[0]?.referenceAnswer).toBe('七天内可退。');
  });
});

describe('scoreRefusalCorrectness', () => {
  it('returns null when expectedRefusal is omitted', () => {
    expect(scoreRefusalCorrectness(undefined, true)).toBeNull();
  });

  it('scores 1 when expectation matches', () => {
    expect(scoreRefusalCorrectness(true, true)).toBe(1);
    expect(scoreRefusalCorrectness(false, false)).toBe(1);
  });

  it('scores 0 when expectation mismatches', () => {
    expect(scoreRefusalCorrectness(true, false)).toBe(0);
    expect(scoreRefusalCorrectness(false, true)).toBe(0);
  });
});

describe('scoreGenerationJudgeSample', () => {
  it('parses fenced JSON and keeps refusal as a local score', () => {
    const score = scoreGenerationJudgeSample(
      groundedInput({ expectedRefusal: false }),
      '```json\n{"faithfulness":0.8,"relevance":1,"rationale":"依据充分"}\n```',
    );

    expect(score).toMatchObject({
      sampleId: 'q1',
      faithfulness: 0.8,
      relevance: 1,
      refusalCorrectness: 1,
      unscorable: false,
      rationale: '依据充分',
    });
    expect(score.parseError).toBeUndefined();
  });

  it('nulls faithfulness when there is no retrieval context', () => {
    const score = scoreGenerationJudgeSample(
      groundedInput({ contexts: [], expectedRefusal: true, refused: true }),
      '{"faithfulness":0.9,"relevance":0.7}',
    );

    expect(score.faithfulness).toBeNull();
    expect(score.relevance).toBe(0.7);
    expect(score.refusalCorrectness).toBe(1);
    expect(score.unscorable).toBe(false);
  });

  it('keeps refusal score when LLM output cannot be parsed', () => {
    const score = scoreGenerationJudgeSample(
      groundedInput({ expectedRefusal: false }),
      'not json',
    );

    expect(score.faithfulness).toBeNull();
    expect(score.relevance).toBeNull();
    expect(score.refusalCorrectness).toBe(1);
    expect(score.unscorable).toBe(false);
    expect(score.parseError).toBeTruthy();
  });

  it('marks unscorable when LLM fails and refusal is unannotated', () => {
    const score = scoreGenerationJudgeSample(groundedInput(), '');

    expect(score.unscorable).toBe(true);
    expect(score.parseError).toBe('missing judge output');
  });
});

describe('aggregateGenerationJudgeScores', () => {
  it('macro-averages per dimension and drops unscorable samples', () => {
    const grounded = scoreGenerationJudgeSample(
      groundedInput({ sampleId: 'ok', expectedRefusal: false }),
      '{"faithfulness":1,"relevance":0.5}',
    );
    const refusalOnly = scoreGenerationJudgeSample(
      groundedInput({
        sampleId: 'refuse',
        contexts: [],
        refused: true,
        expectedRefusal: true,
        answer: '知识库中没有相关依据。',
      }),
      '{"faithfulness":0,"relevance":1}',
    );
    const broken = scoreGenerationJudgeSample(groundedInput({ sampleId: 'bad' }), '');

    const aggregate = aggregateGenerationJudgeScores([grounded, refusalOnly, broken]);

    expect(aggregate.scoredSampleCount).toBe(2);
    expect(aggregate.unscorableSampleIds).toEqual(['bad']);
    expect(aggregate.meanFaithfulness).toBe(1);
    expect(aggregate.faithfulnessSampleCount).toBe(1);
    expect(aggregate.meanRelevance).toBe(0.75);
    expect(aggregate.relevanceSampleCount).toBe(2);
    expect(aggregate.meanRefusalCorrectness).toBe(1);
    expect(aggregate.refusalSampleCount).toBe(2);
  });
});

describe('buildGenerationJudgePrompt', () => {
  it('includes system contract and sample fields', () => {
    const built = buildGenerationJudgePrompt(
      groundedInput({ referenceAnswer: '七日内可退。' }),
    );

    expect(built.system).toBe(GENERATION_JUDGE_SYSTEM_PROMPT);
    expect(built.prompt).toContain('退货时效是多久？');
    expect(built.prompt).toContain('七天内可退货。');
    expect(built.prompt).toContain('return-policy');
    expect(built.prompt).toContain('七日内可退。');
  });
});
