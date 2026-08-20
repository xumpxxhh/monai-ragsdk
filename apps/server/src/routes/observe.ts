import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler, notFound } from '../http/errors.js';
import { readQueryInt, readQueryString } from '../http/query.js';
import { toCollectionSummary } from '../mappers/dto.js';
import { hasChatKey, hasEmbeddingKey, hasVectorStoreConfig } from '../config/env.js';
import {
  countAskInDays,
  getAskTrace,
  listActivities,
  listAskTraces,
  listIngestTraces,
} from '../services/activity-store.js';
import { getCollectionRecord } from '../services/collection-registry.js';
import {
  clearObserverTraces,
  getObserverTrace,
  listObserverTraces,
} from '../services/shared-stack.js';

export const observeRouter: ExpressRouter = Router();

observeRouter.get(
  '/collections/:id/dashboard',
  asyncHandler(async (req, res) => {
    const record = getCollectionRecord(req.params.id);
    const summary = toCollectionSummary(record);
    const ask = countAskInDays(record.id, 7);
    res.json({
      documentCount: summary.documentCount,
      lastIngestSuccess: record.lastIngest ? record.lastIngest.stats.failed === 0 : true,
      lastIngestAt: record.lastIngest?.finishedAt ?? null,
      askCount7d: ask.count,
      avgCitations: ask.avgCitations,
      failedIngestCount: summary.failedIngestCount,
    });
  }),
);

observeRouter.get(
  '/activities',
  asyncHandler(async (req, res) => {
    const collectionId = readQueryString(req.query.collectionId);
    res.json(listActivities(collectionId));
  }),
);

observeRouter.get(
  '/traces/ask',
  asyncHandler(async (req, res) => {
    res.json(
      listAskTraces({
        collectionId: readQueryString(req.query.collectionId),
        q: readQueryString(req.query.q),
      }),
    );
  }),
);

observeRouter.get(
  '/traces/ask/:id',
  asyncHandler(async (req, res) => {
    const trace = getAskTrace(req.params.id);
    if (!trace) {
      throw notFound('轨迹不存在');
    }
    const executionTrace = trace.executionTrace ?? getObserverTrace(trace.id);
    res.json({ ...trace, executionTrace });
  }),
);

observeRouter.get(
  '/traces/ingest',
  asyncHandler(async (req, res) => {
    res.json(listIngestTraces(readQueryString(req.query.collectionId)));
  }),
);

observeRouter.get(
  '/observer/traces',
  asyncHandler(async (req, res) => {
    let traces = listObserverTraces();

    const collectionId = readQueryString(req.query.collectionId)?.trim();
    if (collectionId) {
      traces = traces.filter((trace) => trace.tags?.collectionId === collectionId);
    }

    const scope = readQueryString(req.query.scope)?.trim();
    if (scope) {
      traces = traces.filter((trace) => trace.scope === scope);
    }

    const limit = readQueryInt(req.query.limit, 50);
    res.json(traces.slice(0, limit));
  }),
);

observeRouter.get(
  '/observer/traces/:id',
  asyncHandler(async (req, res) => {
    const trace = listObserverTraces().find((item) => item.traceId === req.params.id);
    if (!trace) {
      throw notFound('轨迹不存在');
    }
    res.json(trace);
  }),
);

observeRouter.post(
  '/observer/traces/clear',
  asyncHandler(async (_req, res) => {
    clearObserverTraces();
    res.status(204).end();
  }),
);

observeRouter.get(
  '/connection',
  asyncHandler(async (_req, res) => {
    res.json({
      embedding: hasEmbeddingKey() ? 'connected' : 'unconfigured',
      chat: hasChatKey() ? 'connected' : 'unconfigured',
      vectorStore: hasVectorStoreConfig() ? 'connected' : 'unconfigured',
    });
  }),
);
