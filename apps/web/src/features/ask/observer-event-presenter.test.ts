import { describe, expect, it } from 'vitest';

import type { RAGEvent } from '@/shared/types';

import { groupPresentedEvents, presentObserverEvent } from './observer-event-presenter';

describe('observer-event-presenter', () => {
  it('presents query preprocess with friendly fields', () => {
    const event: RAGEvent = {
      traceId: 't1',
      scope: 'runtime',
      stage: 'query',
      name: 'runtime.query.preprocess',
      timestamp: 100,
      durationMs: 12,
      attributes: {
        output: {
          query: '退货要几天',
          appliedStrategies: ['rewrite'],
        },
      },
    };
    const presented = presentObserverEvent(event, 0);
    expect(presented.title).toBe('预处理完成');
    expect(presented.fields.some((f) => f.label === '有效问题' && f.value === '退货要几天')).toBe(true);
    expect(presented.fields.some((f) => f.label === '已生效策略' && f.value.includes('问题改写'))).toBe(
      true,
    );
  });

  it('presents strategy step with rewrite diff', () => {
    const event: RAGEvent = {
      traceId: 't1',
      scope: 'runtime',
      stage: 'query_strategy',
      name: 'runtime.query_strategy.complete',
      timestamp: 110,
      attributes: {
        strategy: { name: 'rewrite', index: 0 },
        outcome: 'applied',
        input: { query: '退货多久' },
        output: { query: '退货政策规定的处理时效是多久' },
      },
    };
    const presented = presentObserverEvent(event, 1);
    expect(presented.title).toContain('问题改写');
    expect(presented.outcome).toBe('已生效');
    expect(presented.fields.some((f) => f.label === '改写后')).toBe(true);
  });

  it('presents post retrieval select counts without raw json', () => {
    const event: RAGEvent = {
      traceId: 't1',
      scope: 'runtime',
      stage: 'post_retrieval',
      name: 'runtime.post_retrieval.select',
      timestamp: 200,
      attributes: {
        counts: { input: 10, selected: 4, dropped: 6, chunks: 4 },
        output: {
          chunkIds: ['a', 'b', 'c', 'd'],
          appliedStrategies: ['score-threshold', 'duplicate-removal'],
        },
      },
    };
    const presented = presentObserverEvent(event, 2);
    expect(presented.fields.some((f) => f.label === '进入生成' && f.value === '4')).toBe(true);
    expect(
      presented.fields.some((f) => f.label === '生效的后处理' && f.value.includes('分数阈值')),
    ).toBe(true);
  });

  it('groups events by stage in order', () => {
    const events: RAGEvent[] = [
      {
        traceId: 't1',
        scope: 'runtime',
        stage: 'query',
        name: 'runtime.query.receive',
        timestamp: 1,
        attributes: { output: { query: 'q' } },
      },
      {
        traceId: 't1',
        scope: 'runtime',
        stage: 'retrieval',
        name: 'runtime.retrieval.complete',
        timestamp: 2,
        attributes: { counts: { candidates: 3 } },
      },
    ];
    const groups = groupPresentedEvents(events);
    expect(groups.map((g) => g.group)).toEqual(['pre-retrieval', 'retrieval']);
  });
});
