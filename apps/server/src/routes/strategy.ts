import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler, badRequest } from '../http/errors.js';
import { getGlobalStrategy, saveGlobalStrategy } from '../services/collection-registry.js';
import type { StrategyConfig } from '../types/api.js';

export const strategyRouter: ExpressRouter = Router();

strategyRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(getGlobalStrategy());
  }),
);

strategyRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body as StrategyConfig;
    if (!body || typeof body !== 'object') {
      throw badRequest('无效的策略配置');
    }
    res.json(saveGlobalStrategy(body));
  }),
);
