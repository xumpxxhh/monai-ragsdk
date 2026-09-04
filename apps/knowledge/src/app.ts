import cors from 'cors';
import express, { type Express } from 'express';

import { loadKnowledgeConfig } from './config/env.js';
import { errorMiddleware } from './http/errors.js';
import { requestLogMiddleware } from './http/request-log.js';
import { collectionsRouter } from './routes/collections.js';
import { healthRouter } from './routes/health.js';
import { searchRouter } from './routes/search.js';

/** Agent knowledge 薄面：health + collections 列表 + retrieve-only search。 */
export function createApp(): Express {
  const config = loadKnowledgeConfig();
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  // 在路由之前挂日志：此时 body 已解析，可打 method / path / 入参
  app.use(requestLogMiddleware);

  app.use('/health', healthRouter);

  const api = express.Router();
  api.use('/collections', collectionsRouter);
  api.use('/search', searchRouter);
  app.use('/api/v1', api);

  app.use(errorMiddleware);
  return app;
}
