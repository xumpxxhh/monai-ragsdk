import { Router, type Router as ExpressRouter } from 'express';

import { asyncHandler, badRequest } from '../http/errors.js';
import { readQueryInt, readQueryString } from '../http/query.js';
import { paginate } from '../mappers/dto.js';
import {
  getCollectionRecord,
  ingestDocuments,
  recommendIngestForCollection,
  removeDocument,
  retryDocument,
} from '../services/collection-registry.js';
import {
  beginIngest,
  completeIngestTask,
  createIngestTask,
  endIngest,
  getIngestTask,
  isIngesting,
  updateIngestTask,
} from '../services/ingest-tasks.js';
import type { ChunkingConfig, IngestDocumentInput, IngestMode } from '../types/api.js';

export const documentsRouter: ExpressRouter = Router({ mergeParams: true });

function collectionIdOf(req: { params: { id?: string } }): string {
  const id = req.params.id;
  if (!id) {
    throw badRequest('缺少知识库 ID');
  }
  return id;
}

documentsRouter.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const collectionId = collectionIdOf(req);
    const record = getCollectionRecord(collectionId);
    const q = readQueryString(req.query.q)?.trim().toLowerCase();
    const status = readQueryString(req.query.status);
    let items = record.documents.map(
      ({ content: _content, fingerprint: _fingerprint, ...doc }) => doc,
    );
    if (q) {
      items = items.filter(
        (doc) => doc.title.toLowerCase().includes(q) || doc.sourceId.toLowerCase().includes(q),
      );
    }
    if (status && status !== 'all') {
      items = items.filter((doc) => doc.status === status);
    }
    const page = readQueryInt(req.query.page, 1);
    const pageSize = readQueryInt(req.query.pageSize, 10);
    res.json(paginate(items, page, pageSize));
  }),
);

documentsRouter.get(
  '/ingest/latest',
  asyncHandler(async (req, res) => {
    const record = getCollectionRecord(collectionIdOf(req));
    res.json(record.lastIngest);
  }),
);

documentsRouter.post(
  '/ingest/recommend',
  asyncHandler(async (req, res) => {
    const collectionId = collectionIdOf(req);
    const body = req.body as {
      documents?: Array<{ id?: string; metadata?: { title?: string; mimeType?: string } }>;
    };
    const documents = Array.isArray(body?.documents) ? body.documents : [];
    if (documents.length === 0) {
      throw badRequest('documents 不能为空');
    }
    res.json(recommendIngestForCollection(collectionId, documents));
  }),
);

documentsRouter.post(
  '/ingest',
  asyncHandler(async (req, res) => {
    const collectionId = collectionIdOf(req);
    if (isIngesting(collectionId)) {
      throw badRequest('该知识库正在入库，请稍后再试');
    }

    const body = req.body as {
      documents?: IngestDocumentInput[];
      mode?: IngestMode;
      chunking?: ChunkingConfig;
    };
    const documents = Array.isArray(body?.documents) ? body.documents : [];
    const fileName = documents[0]?.metadata?.title ?? documents[0]?.id ?? '文档';
    const { taskId } = createIngestTask(collectionId, Math.max(documents.length, 1), fileName);
    beginIngest(collectionId);

    void (async () => {
      try {
        updateIngestTask(taskId, { current: 1, fileName });
        const stats = await ingestDocuments(collectionId, documents, body?.mode, body?.chunking);
        completeIngestTask(taskId, stats);
      } catch (error) {
        const message = error instanceof Error ? error.message : '入库失败';
        completeIngestTask(
          taskId,
          {
            added: 0,
            skipped: 0,
            replaced: 0,
            failed: documents.length,
            cleaned: 0,
          },
          message,
        );
      } finally {
        endIngest(collectionId);
      }
    })();

    res.status(202).json({ taskId });
  }),
);

documentsRouter.get(
  '/ingest/:taskId',
  asyncHandler(async (req, res) => {
    res.json(getIngestTask(collectionIdOf(req), req.params.taskId));
  }),
);

documentsRouter.post(
  '/documents/:documentId/retry',
  asyncHandler(async (req, res) => {
    await retryDocument(collectionIdOf(req), req.params.documentId);
    res.status(204).end();
  }),
);

documentsRouter.delete(
  '/documents/:documentId',
  asyncHandler(async (req, res) => {
    await removeDocument(collectionIdOf(req), req.params.documentId);
    res.status(204).end();
  }),
);
