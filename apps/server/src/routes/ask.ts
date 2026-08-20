import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler, badRequest } from '../http/errors.js';
import { prepareGlobalAsk } from '../services/collection-registry.js';
import { streamAskResponse } from '../services/ask-stream.js';
import type { GlobalAskRequest } from '../types/api.js';

export const askRouter: ExpressRouter = Router();

askRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as GlobalAskRequest;
    const question = body?.question?.trim();
    if (!question) {
      throw badRequest('question 不能为空');
    }

    const collectionIds = Array.isArray(body.collectionIds)
      ? body.collectionIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
      : undefined;

    const { runtime, strategy, targets } = await prepareGlobalAsk(question, collectionIds);
    await streamAskResponse(req, res, { runtime, strategy, targets, question });
  }),
);
