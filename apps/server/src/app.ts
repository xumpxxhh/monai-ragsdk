import cors from 'cors';
import express, { type Express } from 'express';

import { loadServerConfig } from './config/env.js';
import { errorMiddleware } from './http/errors.js';
import { collectionsRouter } from './routes/collections.js';
import { documentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';
import { observeRouter } from './routes/observe.js';

/** 组装 Express 应用：健康检查在根路径，业务 API 挂在 /api/v1。 */
export function createApp(): Express {
  const config = loadServerConfig();
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));

  app.use('/health', healthRouter);

  const api = express.Router();
  api.use('/collections', collectionsRouter);
  api.use('/collections/:id', documentsRouter);
  api.use(observeRouter);
  app.use('/api/v1', api);

  app.use(errorMiddleware);
  return app;
}
