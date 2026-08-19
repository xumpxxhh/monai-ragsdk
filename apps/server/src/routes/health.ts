import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler } from '../http/errors.js';

export const healthRouter: ExpressRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ ok: true });
  }),
);
