import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler } from '../http/errors.js';
import { listCollectionRecords, toCollectionSummary } from '../services/console-state.js';

export const collectionsRouter: ExpressRouter = Router();

collectionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = listCollectionRecords().map(toCollectionSummary);
    res.json(items);
  }),
);
