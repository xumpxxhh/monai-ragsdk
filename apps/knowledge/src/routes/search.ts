import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler, badRequest } from '../http/errors.js';
import { mapKnowledgeSearchResult } from '../mappers/search-result.js';
import { searchKnowledge } from '../services/search-runtime.js';
import type { KnowledgeSearchRequest } from '../types.js';

export const searchRouter: ExpressRouter = Router();

searchRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as KnowledgeSearchRequest;
    const query = body?.query?.trim();
    if (!query) {
      throw badRequest('query 不能为空');
    }

    const collectionIds = Array.isArray(body.collectionIds)
      ? body.collectionIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
      : undefined;

    const { result, targets, resolvedTopK } = await searchKnowledge(
      query,
      body.topK,
      collectionIds,
    );

    const defaultCollectionId = targets.length === 1 ? targets[0]!.id : undefined;
    res.json(mapKnowledgeSearchResult(result, query, resolvedTopK, defaultCollectionId));
  }),
);
