import { randomUUID } from 'node:crypto';

import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler, badRequest } from '../http/errors.js';
import { readQueryInt, readQueryString } from '../http/query.js';
import { mapCitations, mapSearchResult, paginate } from '../mappers/dto.js';
import {
  askCollection,
  getCollectionRecord,
  ingestDocuments,
  recordAskActivity,
  removeDocument,
  retryDocument,
  saveStrategyConfig,
  searchCollection,
} from '../services/collection-registry.js';
import {
  beginIngest,
  completeIngestTask,
  createIngestTask,
  endIngest,
  getIngestTask,
  isIngesting,
  updateIngestTask,
} from '../services/ingest-tasks.js';
import { recordAskTrace } from '../services/activity-store.js';
import type { IngestDocumentInput, IngestMode, StrategyConfig } from '../types/api.js';

export const documentsRouter: ExpressRouter = Router({ mergeParams: true });

function collectionIdOf(req: { params: { id?: string } }): string {
  const id = req.params.id;
  if (!id) {
    throw badRequest('缺少知识库 ID');
  }
  return id;
}

documentsRouter.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const collectionId = collectionIdOf(req);
    const record = getCollectionRecord(collectionId);
    const q = readQueryString(req.query.q)?.trim().toLowerCase();
    const status = readQueryString(req.query.status);
    let items = record.documents.map(
      ({ content: _content, fingerprint: _fingerprint, ...doc }) => doc,
    );
    if (q) {
      items = items.filter(
        (doc) => doc.title.toLowerCase().includes(q) || doc.sourceId.toLowerCase().includes(q),
      );
    }
    if (status && status !== 'all') {
      items = items.filter((doc) => doc.status === status);
    }
    const page = readQueryInt(req.query.page, 1);
    const pageSize = readQueryInt(req.query.pageSize, 10);
    res.json(paginate(items, page, pageSize));
  }),
);

documentsRouter.get(
  '/ingest/latest',
  asyncHandler(async (req, res) => {
    const record = getCollectionRecord(collectionIdOf(req));
    res.json(record.lastIngest);
  }),
);

documentsRouter.post(
  '/ingest',
  asyncHandler(async (req, res) => {
    const collectionId = collectionIdOf(req);
    if (isIngesting(collectionId)) {
      throw badRequest('该知识库正在入库，请稍后再试');
    }

    const body = req.body as { documents?: IngestDocumentInput[]; mode?: IngestMode };
    const documents = Array.isArray(body?.documents) ? body.documents : [];
    const fileName = documents[0]?.metadata?.title ?? documents[0]?.id ?? '文档';
    const { taskId } = createIngestTask(collectionId, Math.max(documents.length, 1), fileName);
    beginIngest(collectionId);

    void (async () => {
      try {
        updateIngestTask(taskId, { current: 1, fileName });
        const stats = await ingestDocuments(collectionId, documents, body?.mode);
        completeIngestTask(taskId, stats);
      } catch (error) {
        const message = error instanceof Error ? error.message : '入库失败';
        completeIngestTask(
          taskId,
          {
            added: 0,
            skipped: 0,
            replaced: 0,
            failed: documents.length,
            cleaned: 0,
          },
          message,
        );
      } finally {
        endIngest(collectionId);
      }
    })();

    res.status(202).json({ taskId });
  }),
);

documentsRouter.get(
  '/ingest/:taskId',
  asyncHandler(async (req, res) => {
    res.json(getIngestTask(collectionIdOf(req), req.params.taskId));
  }),
);

documentsRouter.post(
  '/documents/:documentId/retry',
  asyncHandler(async (req, res) => {
    await retryDocument(collectionIdOf(req), req.params.documentId);
    res.status(204).end();
  }),
);

documentsRouter.delete(
  '/documents/:documentId',
  asyncHandler(async (req, res) => {
    await removeDocument(collectionIdOf(req), req.params.documentId);
    res.status(204).end();
  }),
);

documentsRouter.post(
  '/search',
  asyncHandler(async (req, res) => {
    const collectionId = collectionIdOf(req);
    const body = req.body as { query?: string; topK?: number };
    const query = body?.query?.trim();
    if (!query) {
      throw badRequest('query 不能为空');
    }
    const topK =
      typeof body.topK === 'number' && Number.isInteger(body.topK) && body.topK > 0
        ? body.topK
        : getCollectionRecord(collectionId).strategy.retrieval.topK;
    const result = await searchCollection(collectionId, query, topK);
    res.json(mapSearchResult(result, query, topK));
  }),
);

documentsRouter.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const collectionId = collectionIdOf(req);
    const body = req.body as { question?: string };
    const question = body?.question?.trim();
    if (!question) {
      throw badRequest('question 不能为空');
    }

    const { runtime, collectionName, strategy } = await askCollection(collectionId, question);
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
          trace: { traceId: requestId, tags: { collectionId, collectionName } },
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
    });
  }),
);

documentsRouter.get(
  '/strategy',
  asyncHandler(async (req, res) => {
    res.json(getCollectionRecord(collectionIdOf(req)).strategy);
  }),
);

documentsRouter.put(
  '/strategy',
  asyncHandler(async (req, res) => {
    const collectionId = collectionIdOf(req);
    const body = req.body as StrategyConfig;
    if (!body || typeof body !== 'object') {
      throw badRequest('无效的策略配置');
    }
    res.json(saveStrategyConfig(collectionId, body));
  }),
);
