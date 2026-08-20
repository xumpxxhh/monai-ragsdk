import { randomUUID } from 'node:crypto';

import type { Runtime } from '@monai-ragsdk/runtime';
import type { Request, Response } from 'express';

import { mapCitations } from '../mappers/dto.js';
import type { StrategyConfig } from '../types/api.js';
import { recordAskTrace } from './activity-store.js';
import { recordAskActivity } from './collection-registry.js';
import { getObserverTrace } from './shared-stack.js';
import type { CollectionRecord } from './state-store.js';

export type AskStreamContext = {
  runtime: Runtime;
  strategy: StrategyConfig;
  targets: CollectionRecord[];
  question: string;
};

function scopeLabels(targets: CollectionRecord[]): {
  collectionId: string;
  collectionName: string;
} {
  if (targets.length === 1) {
    return { collectionId: targets[0]!.id, collectionName: targets[0]!.name };
  }
  return {
    collectionId: 'global',
    collectionName: targets.length === 0 ? '全局' : `${targets.length} 个知识库`,
  };
}

/** 将 runtime.runStream 转为 SSE，并写入 ask 轨迹；供 POST /api/v1/ask 专用。 */
export async function streamAskResponse(
  req: Request,
  res: Response,
  context: AskStreamContext,
): Promise<void> {
  const { runtime, strategy, targets, question } = context;
  const { collectionId, collectionName } = scopeLabels(targets);
  const requestId = randomUUID();

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  const startedAt = Date.now();
  let citationCount = 0;
  let effectiveQuestion: string | undefined;
  let success = true;
  const stages: { id: string; label: string; durationMs?: number }[] = [];

  try {
    for await (const event of runtime.runStream(
      { query: question },
      {
        requestId,
        // 为了让 /api/v1/traces/ask 能拿到 runtime.debug.timings，从而记录 stages。
        includeDebug: true,
        trace: {
          traceId: requestId,
          tags: {
            collectionId,
            collectionName,
            collectionIds: targets.map((item) => item.id).join(','),
          },
        },
      },
    )) {
      if (aborted) {
        break;
      }
      if (event.type === 'delta' && event.text) {
        send({ type: 'token', content: event.text });
      }
      if (event.type === 'result') {
        const empty = event.result.chunks.length === 0;
        const noGrounding = empty && strategy.generation.noGroundingPolicy === 'explicit';
        effectiveQuestion =
          event.result.effectiveQuery.query !== question
            ? event.result.effectiveQuery.query
            : undefined;
        if (effectiveQuestion) {
          send({ type: 'meta', effectiveQuery: effectiveQuestion });
        }
        const citations = noGrounding ? [] : mapCitations(event.result);
        citationCount = citations.length;
        send({ type: 'result', citations, noGrounding });

        const timings = event.result.debug?.timings ?? {};
        for (const [id, durationMs] of Object.entries(timings)) {
          stages.push({ id, label: id, durationMs });
        }
      }
    }
  } catch (error) {
    success = false;
    const message = error instanceof Error ? error.message : '问答失败';
    if (!aborted) {
      send({ type: 'error', message });
    }
  }

  if (!aborted) {
    send({ type: 'done' });
    res.write('data: [DONE]\n\n');
  }
  res.end();

  recordAskActivity({ collectionId, collectionName, question, citationCount });
  const executionTrace = getObserverTrace(requestId);
  await recordAskTrace({
    id: requestId,
    collectionId,
    collectionName,
    question,
    effectiveQuestion,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    success,
    citationCount,
    stages,
    warnings: success ? [] : ['问答执行失败'],
    ...(executionTrace ? { executionTrace } : {}),
  });
}
