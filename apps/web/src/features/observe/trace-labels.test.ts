import { describe, expect, it } from 'vitest';

import type { RAGEvent } from '@/shared/types';

import { eventLabel, isFailureEvent, summarizeEventAttributes } from './trace-labels';

describe('trace-labels', () => {
  it('maps known runtime events to Chinese labels', () => {
    expect(eventLabel('runtime.retrieval.complete')).toBe('检索完成');
    expect(eventLabel('runtime.query.preprocess')).toBe('查询预处理');
  });

  it('detects failure events', () => {
    expect(isFailureEvent('runtime.run.fail')).toBe(true);
    expect(isFailureEvent('runtime.retrieval.complete')).toBe(false);
  });

  it('summarizes retrieval and post_retrieval attributes', () => {
    const retrievalComplete: RAGEvent = {
      traceId: 't1',
      scope: 'runtime',
      stage: 'retrieval',
      name: 'runtime.retrieval.complete',
      timestamp: 100,
      durationMs: 117,
      attributes: {
        counts: { candidates: 3 },
        output: { emptyRetrieval: false },
      },
    };
    expect(summarizeEventAttributes(retrievalComplete)).toContain('候选: 3');

    const postSelect: RAGEvent = {
      traceId: 't1',
      scope: 'runtime',
      stage: 'post_retrieval',
      name: 'runtime.post_retrieval.select',
      timestamp: 200,
      attributes: {
        output: {
          selected: 3,
          dropped: 0,
          selectedChunkIds: ['a', 'b', 'c'],
        },
      },
    };
    const summary = summarizeEventAttributes(postSelect);
    expect(summary).toContain('选中 3');
    expect(summary).toContain('a, b, c');
  });
});
