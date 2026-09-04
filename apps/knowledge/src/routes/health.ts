import { Router, type Router as ExpressRouter } from 'express';

import { hasEmbeddingKey, hasVectorStoreConfig } from '../config/env.js';
import { asyncHandler } from '../http/errors.js';
import type { HealthResponse } from '../types.js';

export const healthRouter: ExpressRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const body: HealthResponse = {
      ok: true,
      embedding: hasEmbeddingKey() ? 'connected' : 'unconfigured',
      vectorStore: hasVectorStoreConfig() ? 'connected' : 'unconfigured',
    };
    res.json(body);
  }),
);
