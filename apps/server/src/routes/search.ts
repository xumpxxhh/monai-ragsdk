import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler, badRequest } from '../http/errors.js';
import { mapSearchResult } from '../mappers/dto.js';
import { getGlobalStrategy, searchGlobal } from '../services/collection-registry.js';
import type { GlobalSearchRequest } from '../types/api.js';

export const searchRouter: ExpressRouter = Router();

searchRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as GlobalSearchRequest;
    const query = body?.query?.trim();
    if (!query) {
      throw badRequest('query 不能为空');
    }

    const collectionIds = Array.isArray(body.collectionIds)
      ? body.collectionIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
      : undefined;

    const strategy = getGlobalStrategy();
    const topK =
      typeof body.topK === 'number' && Number.isInteger(body.topK) && body.topK > 0
        ? body.topK
        : strategy.retrieval.topK;

    const result = await searchGlobal(query, body.topK, collectionIds);
    res.json(mapSearchResult(result, query, topK));
  }),
);
