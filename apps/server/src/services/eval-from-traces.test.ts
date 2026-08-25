import { describe, expect, it } from 'vitest';

import { matchSamplesToTraces, runEvalFromTraces } from './eval-from-traces.js';
import type { AskTrace } from '../types/api.js';

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

function trace(overrides: Partial<AskTrace> & Pick<AskTrace, 'id' | 'question'>): AskTrace {
  return {
    collectionId: 'kb-1',
    collectionName: 'demo',
    finishedAt: '2026-08-24T00:00:00.000Z',
    durationMs: 12,
    success: true,
    citationCount: 1,
    stages: [],
    warnings: [],
    ...overrides,
  };
}

describe('matchSamplesToTraces', () => {
  it('matches newest trace by question and leaves extras unmatched', () => {
    const traces = [
      trace({ id: 'new', question: '退货时效是多久？' }),
      trace({ id: 'old', question: '退货时效是多久？' }),
      trace({ id: 'weather', question: '天气怎么样？' }),
    ];

    const result = matchSamplesToTraces(dataset.samples, traces);

    expect(result.matched.map((item) => [item.sample.id, item.trace.id])).toEqual([
      ['q1', 'new'],
      ['q2', 'weather'],
    ]);
    expect(result.unmatchedSampleIds).toEqual([]);
  });

  it('falls back to effectiveQuestion', () => {
    const result = matchSamplesToTraces(dataset.samples, [
      trace({
        id: 'rewritten',
        question: '用户原话',
        effectiveQuestion: '退货时效是多久？',
      }),
    ]);

    expect(result.matched[0]?.trace.id).toBe('rewritten');
    expect(result.unmatchedSampleIds).toEqual(['q2']);
  });
});

describe('runEvalFromTraces', () => {
  it('scores retrieval from evalSnapshot and judges when answer is complete', async () => {
    const report = await runEvalFromTraces(
      { dataset },
      {
        listTraces: () => [
          trace({
            id: 't1',
            question: '退货时效是多久？',
            evalSnapshot: {
              answer: '七天内可退货。',
              refused: false,
              retrieved: [{ chunkId: 'c1', sourceId: 'return-policy', rank: 1, score: 0.9 }],
              selected: [{ chunkId: 'c1', sourceId: 'return-policy', text: '七日内可退。' }],
            },
          }),
          trace({
            id: 't2',
            question: '天气怎么样？',
            evalSnapshot: {
              answer: '知识库中没有相关依据。',
              refused: true,
              retrieved: [],
              selected: [],
            },
          }),
        ],
        async completeJudge(_system, prompt) {
          if (prompt.includes('天气')) {
            return '{"faithfulness":0,"relevance":1}';
          }
          return '{"faithfulness":1,"relevance":0.5}';
        },
      },
    );

    expect(report.matchedSampleCount).toBe(2);
    expect(report.unmatchedSampleIds).toEqual([]);
    expect(report.skippedJudgeSampleIds).toEqual([]);
    expect(report.retrieval.samples[0]).toMatchObject({
      sampleId: 'q1',
      traceId: 't1',
      unscorable: false,
      mrr: 1,
    });
    expect(report.judge?.samples[0]).toMatchObject({
      sampleId: 'q1',
      faithfulness: 1,
      relevance: 0.5,
      refusalCorrectness: 1,
    });
    expect(report.judge?.samples[1]).toMatchObject({
      sampleId: 'q2',
      faithfulness: null,
      refused: true,
      refusalCorrectness: 1,
    });
  });

  it('does not use answerPreview and skips judge without evalSnapshot', async () => {
    const report = await runEvalFromTraces(
      { dataset, includeJudge: true },
      {
        listTraces: () => [
          trace({
            id: 'legacy',
            question: '退货时效是多久？',
            executionTrace: {
              traceId: 'legacy',
              scope: 'runtime',
              startedAt: 0,
              status: 'ok',
              events: [
                {
                  traceId: 'legacy',
                  scope: 'runtime',
                  stage: 'retrieval',
                  name: 'runtime.retrieval.complete',
                  timestamp: 1,
                  attributes: { candidates: [{ chunkId: 'c1', score: 0.9 }] },
                },
                {
                  traceId: 'legacy',
                  scope: 'runtime',
                  stage: 'generation',
                  name: 'runtime.generation.complete',
                  timestamp: 2,
                  attributes: { output: { answerPreview: '七天内可退货。' } },
                },
              ],
            },
          }),
        ],
        async completeJudge() {
          throw new Error('should not judge preview-only traces');
        },
      },
    );

    expect(report.matchedSampleCount).toBe(1);
    expect(report.unmatchedSampleIds).toEqual(['q2']);
    expect(report.skippedJudgeSampleIds).toEqual(['q1']);
    expect(report.judge).toBeUndefined();
    expect(report.retrieval.samples[0]?.unscorable).toBe(true);
  });
});
