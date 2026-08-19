import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler } from '../http/errors.js';
import { readQueryInt, readQueryString } from '../http/query.js';
import { paginate, toCollectionDetail, toCollectionSummary } from '../mappers/dto.js';
import {
  createCollectionRecord,
  getCollectionRecord,
  listCollectionRecords,
  removeCollectionRecord,
  updateCollectionRecord,
} from '../services/collection-registry.js';
import type { CreateCollectionInput } from '../types/api.js';

export const collectionsRouter: ExpressRouter = Router();

collectionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pageRaw = readQueryString(req.query.page);
    const records = listCollectionRecords();
    const q = readQueryString(req.query.q)?.trim().toLowerCase() ?? '';
    const filtered = records.filter((record) => !q || record.name.toLowerCase().includes(q));
    const summaries = filtered.map(toCollectionSummary);

    if (pageRaw === undefined) {
      res.json(summaries);
      return;
    }

    const page = readQueryInt(req.query.page, 1);
    const pageSize = readQueryInt(req.query.pageSize, 12);
    res.json(paginate(summaries, page, pageSize));
  }),
);

collectionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Partial<CreateCollectionInput>;
    const created = createCollectionRecord({
      name: body.name ?? '',
      description: body.description,
      ingestMode: body.ingestMode ?? 'incremental',
    });
    res.status(201).json(toCollectionDetail(created));
  }),
);

collectionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(toCollectionDetail(getCollectionRecord(req.params.id)));
  }),
);

collectionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = req.body as { name?: string; description?: string };
    const updated = updateCollectionRecord(req.params.id, {
      name: body?.name,
      description: body?.description,
    });
    res.json(toCollectionDetail(updated));
  }),
);

collectionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await removeCollectionRecord(req.params.id);
    res.status(204).end();
  }),
);
