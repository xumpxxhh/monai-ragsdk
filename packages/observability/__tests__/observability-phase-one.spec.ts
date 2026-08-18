import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  createConsoleObserver,
  NoopObserver,
  type RAGAttributes,
  type RAGErrorRecord,
  type RAGEvent,
  type RAGTrace,
} from '../src/index.js';

describe('observability phase 1', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports nested JSON attributes', () => {
    const attributes: RAGAttributes = {
      query: '公司年假政策是什么？',
      candidates: [
        {
          id: 'chunk-1',
          metadata: {
            section: 'leave',
            page: 3,
          },
        },
      ],
      droppedReasons: {
        score_below_threshold: 2,
      },
    };

    expect(attributes.candidates).toHaveLength(1);
  });

  it('constructs runtime events with the unified name format', () => {
    const event: RAGEvent = {
      traceId: 'trace-1',
      scope: 'runtime',
      stage: 'retrieval',
      name: 'runtime.retrieval.complete',
      timestamp: Date.now(),
    };

    expect(event.name).toBe('runtime.retrieval.complete');
  });

  it('keeps NoopObserver side-effect free', async () => {
    const event: RAGEvent = {
      traceId: 'trace-1',
      scope: 'runtime',
      stage: 'retrieval',
      name: 'runtime.retrieval.complete',
      timestamp: Date.now(),
    };

    const error: RAGErrorRecord = {
      traceId: 'trace-1',
      scope: 'runtime',
      stage: 'generation',
      name: 'runtime.generation.fail',
      timestamp: Date.now(),
      error: {
        name: 'RuntimeError',
        message: 'generation failed',
      },
    };

    const trace: RAGTrace = {
      traceId: 'trace-1',
      scope: 'runtime',
      startedAt: Date.now(),
      status: 'ok',
      events: [event],
    };

    await expect(NoopObserver.onEvent?.(event)).resolves.toBeUndefined();
    await expect(NoopObserver.onError?.(error)).resolves.toBeUndefined();
    await expect(NoopObserver.onTraceEnd?.(trace)).resolves.toBeUndefined();
  });

  it('isolates console observer callback failures', async () => {
    const observer = createConsoleObserver({ level: 'info' });
    vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('console unavailable');
    });

    const event: RAGEvent = {
      traceId: 'trace-1',
      scope: 'runtime',
      stage: 'retrieval',
      name: 'runtime.retrieval.complete',
      timestamp: Date.now(),
    };

    await expect(observer.onEvent?.(event)).resolves.toBeUndefined();
  });

  it('logs event attributes when configured', async () => {
    const observer = createConsoleObserver({
      level: 'debug',
      includeAttributes: true,
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const event: RAGEvent = {
      traceId: 'trace-1',
      scope: 'runtime',
      stage: 'query',
      name: 'runtime.query.receive',
      timestamp: Date.now(),
      attributes: {
        query: '公司年假政策是什么？',
      },
    };

    await observer.onEvent?.(event);

    expect(debugSpy).toHaveBeenCalledWith('[runtime] runtime.query.receive', event.attributes);
  });
});
