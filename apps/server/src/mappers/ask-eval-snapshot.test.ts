import { describe, expect, it } from 'vitest';

import type { RAGTrace } from '@monai-ragsdk/observability';

import {
  toAskEvalSnapshot,
  toRetrievalObservationFromAskTrace,
  tryGenerationJudgeInputFromAskTrace,
} from './ask-eval-snapshot.js';
import type { AskTrace } from '../types/api.js';

function baseTrace(overrides: Partial<AskTrace> = {}): AskTrace {
  return {
    id: 'trace-1',
    collectionId: 'kb-1',
    collectionName: 'demo',
    question: '退货时效是多久？',
    finishedAt: '2026-08-24T00:00:00.000Z',
    durationMs: 10,
    success: true,
    citationCount: 1,
    stages: [],
    warnings: [],
    ...overrides,
  };
}

describe('toAskEvalSnapshot', () => {
  it('keeps full answer, sourceIds and selected text', () => {
    const snapshot = toAskEvalSnapshot({
      answer: '七天内可退货。',
      chunks: [{ id: 'c1', content: '自签收之日起七日内可退货。', metadata: { sourceId: 'return-policy' } }],
      citations: [{ index: 1, chunkId: 'c1', sourceId: 'return-policy' }],
      originalQuery: { query: '退货时效是多久？' },
      effectiveQuery: { query: '退货时效是多久？' },
      retrievedCandidates: [{ chunkId: 'c1', sourceId: 'return-policy', score: 0.9 }],
      generationMetadata: { groundingRefusal: false },
    });

    expect(snapshot.answer).toBe('七天内可退货。');
    expect(snapshot.refused).toBe(false);
    expect(snapshot.retrieved).toEqual([
      { chunkId: 'c1', sourceId: 'return-policy', score: 0.9, rank: 1 },
    ]);
    expect(snapshot.selected).toEqual([
      { chunkId: 'c1', sourceId: 'return-policy', text: '自签收之日起七日内可退货。' },
    ]);
  });
});

describe('toRetrievalObservationFromAskTrace', () => {
  it('prefers evalSnapshot sourceIds over observer candidates', () => {
    const observation = toRetrievalObservationFromAskTrace(
      baseTrace({
        evalSnapshot: {
          answer: '七天内可退货。',
          refused: false,
          retrieved: [{ chunkId: 'c1', sourceId: 'return-policy', rank: 1, score: 0.9 }],
          selected: [{ chunkId: 'c1', sourceId: 'return-policy', text: '七日内可退。' }],
        },
        executionTrace: {
          traceId: 'trace-1',
          scope: 'runtime',
          startedAt: 0,
          status: 'ok',
          events: [
            {
              traceId: 'trace-1',
              scope: 'runtime',
              stage: 'retrieval',
              name: 'runtime.retrieval.complete',
              timestamp: 1,
              attributes: { candidates: [{ chunkId: 'c1', score: 0.1 }] },
            },
          ],
        },
      }),
    );

    expect(observation.retrieved[0]).toEqual({
      chunkId: 'c1',
      sourceId: 'return-policy',
      rank: 1,
      score: 0.9,
    });
    expect(observation.selected[0]).toEqual({ chunkId: 'c1', sourceId: 'return-policy' });
  });

  it('falls back to observer chunkIds without inventing sourceId', () => {
    const executionTrace: RAGTrace = {
      traceId: 'trace-1',
      scope: 'runtime',
      startedAt: 0,
      status: 'ok',
      events: [
        {
          traceId: 'trace-1',
          scope: 'runtime',
          stage: 'retrieval',
          name: 'runtime.retrieval.complete',
          timestamp: 1,
          attributes: { candidates: [{ chunkId: 'c1', score: 0.8 }, { chunkId: 'c2' }] },
        },
        {
          traceId: 'trace-1',
          scope: 'runtime',
          stage: 'post_retrieval',
          name: 'runtime.post_retrieval.select',
          timestamp: 2,
          attributes: { output: { chunkIds: ['c2'] } },
        },
      ],
    };

    const observation = toRetrievalObservationFromAskTrace(baseTrace({ executionTrace }));

    expect(observation.retrieved).toEqual([
      { chunkId: 'c1', rank: 1, score: 0.8 },
      { chunkId: 'c2', rank: 2 },
    ]);
    expect(observation.selected).toEqual([{ chunkId: 'c2' }]);
  });
});

describe('tryGenerationJudgeInputFromAskTrace', () => {
  const sample = {
    id: 'q1',
    query: '退货时效是多久？',
    relevantSourceIds: ['return-policy'],
    expectedRefusal: false,
  };

  it('builds judge input from evalSnapshot and never reads answerPreview', () => {
    const result = tryGenerationJudgeInputFromAskTrace(
      sample,
      baseTrace({
        evalSnapshot: {
          answer: '七天内可退货。',
          refused: false,
          retrieved: [],
          selected: [{ chunkId: 'c1', sourceId: 'return-policy', text: '七日内可退。' }],
        },
        executionTrace: {
          traceId: 'trace-1',
          scope: 'runtime',
          startedAt: 0,
          status: 'ok',
          events: [
            {
              traceId: 'trace-1',
              scope: 'runtime',
              stage: 'generation',
              name: 'runtime.generation.complete',
              timestamp: 1,
              attributes: { output: { answerPreview: 'truncated-preview' } },
            },
          ],
        },
      }),
    );

    expect('input' in result).toBe(true);
    if ('input' in result) {
      expect(result.input.answer).toBe('七天内可退货。');
      expect(result.input.answer).not.toContain('truncated-preview');
      expect(result.input.contexts[0]?.text).toBe('七日内可退。');
    }
  });

  it('skips judge when snapshot is missing even if preview exists', () => {
    const result = tryGenerationJudgeInputFromAskTrace(
      sample,
      baseTrace({
        executionTrace: {
          traceId: 'trace-1',
          scope: 'runtime',
          startedAt: 0,
          status: 'ok',
          events: [
            {
              traceId: 'trace-1',
              scope: 'runtime',
              stage: 'generation',
              name: 'runtime.generation.complete',
              timestamp: 1,
              attributes: { output: { answerPreview: '七天内可退货。' } },
            },
          ],
        },
      }),
    );

    expect(result).toEqual({ skip: 'missing_answer' });
  });
});
