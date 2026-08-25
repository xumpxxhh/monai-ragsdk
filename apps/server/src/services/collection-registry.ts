import { createHash, randomUUID } from 'node:crypto';

import type { Document } from '@monai-ragsdk/core';
import { PgVectorRuntimeRetrieverAdapter, PgVectorStoreAdapter } from '@monai-ragsdk/adapters';
import { SimpleChunker, runIndexing, type IndexingOptions } from '@monai-ragsdk/indexing';
import {
  createCollection,
  type Runtime,
  type RuntimeResult,
  type RuntimeSearchResult,
} from '@monai-ragsdk/runtime';
import { Pool } from 'pg';

import { loadServerConfig } from '../config/env.js';
import { badRequest, notFound } from '../http/errors.js';
import { toCollectionDetail, toIngestStats } from '../mappers/dto.js';
import type {
  ChunkingConfig,
  CreateCollectionInput,
  DocumentDetail,
  IngestDocumentInput,
  IngestMode,
  IngestRecommendation,
  IngestStats,
  StrategyConfig,
} from '../types/api.js';
import { recordActivity, recordIngestTrace, ingestActivityTitle } from './activity-store.js';
import { buildChunker, recommendIngestConfig } from './chunking.js';
import {
  legacyDoublePrefixedTableName,
  quoteSqlIdent,
  tableNameFor,
} from './collection-table-name.js';
import { buildRuntime, defaultStrategy } from './pipeline-factory.js';
import { embedQuery, getSharedStack } from './shared-stack.js';
import { loadState, saveState, type CollectionRecord, type StoredDocument } from './state-store.js';

type CollectionFacade = ReturnType<typeof createCollection>;

type CollectionHandle = {
  record: CollectionRecord;
  store?: PgVectorStoreAdapter;
  retriever?: PgVectorRuntimeRetrieverAdapter;
  runtime?: Runtime;
  collection?: CollectionFacade;
  indexingBase?: Omit<IndexingOptions, 'loader'>;
};

const handles = new Map<string, CollectionHandle>();
let globalStrategy: StrategyConfig = defaultStrategy('global');

function persist(): void {
  saveState({
    collections: [...handles.values()].map((handle) => handle.record),
    globalStrategy,
  });
}

function tableNameOf(collectionId: string): string {
  try {
    return tableNameFor(collectionId);
  } catch {
    throw badRequest('无效的知识库 ID');
  }
}

/** 首次访问时把旧的 kb_kb_ 表改成规范名，避免 ingest 写到空表、旧向量被丢在一边。 */
async function migrateLegacyVectorTable(
  connectionString: string,
  collectionId: string,
): Promise<string> {
  const tableName = tableNameOf(collectionId);
  const legacyName = legacyDoublePrefixedTableName(collectionId);
  if (legacyName === tableName) {
    return tableName;
  }

  const pool = new Pool({ connectionString });
  try {
    const found = await pool.query<{ legacy: string | null; canonical: string | null }>(
      'SELECT to_regclass($1) AS legacy, to_regclass($2) AS canonical',
      [`public.${legacyName}`, `public.${tableName}`],
    );
    const row = found.rows[0];
    if (row?.legacy && !row.canonical) {
      await pool.query(
        `ALTER TABLE "public".${quoteSqlIdent(legacyName)} RENAME TO ${quoteSqlIdent(tableName)}`,
      );
    }
  } finally {
    await pool.end();
  }

  return tableName;
}

function fingerprintOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function sourceIdOf(input: IngestDocumentInput, fallbackId: string): string {
  const fromMeta = input.metadata?.sourceId?.trim();
  if (fromMeta) {
    return fromMeta;
  }
  if (input.id?.trim()) {
    return input.id.trim();
  }
  return fallbackId;
}

function titleOf(input: IngestDocumentInput, sourceId: string): string {
  return input.metadata?.title?.trim() || sourceId;
}

function toDocuments(inputs: IngestDocumentInput[]): Document[] {
  return inputs.map((input, index) => {
    const sourceId = sourceIdOf(input, `doc-${index + 1}`);
    const title = titleOf(input, sourceId);
    return {
      id: input.id?.trim() || sourceId,
      content: input.content,
      metadata: {
        sourceId,
        title,
        documentTitle: title,
        source: sourceId,
      },
    };
  });
}

/**
 * 进程内知识库登记：元数据 JSON 落盘，向量按库分表。
 * 连接池延迟到首次 ingest / search / ask，这样 /health 不依赖模型密钥。
 */
export function initCollectionRegistry(): void {
  const state = loadState();
  globalStrategy = state.globalStrategy ?? defaultStrategy('global');
  for (const record of state.collections) {
    handles.set(record.id, { record });
  }
}

export function getGlobalStrategy(): StrategyConfig {
  return globalStrategy;
}

export function saveGlobalStrategy(strategy: StrategyConfig): StrategyConfig {
  globalStrategy = {
    ...strategy,
    collectionId: 'global',
  };
  persist();
  recordActivity({
    kind: 'strategy',
    title: '全局策略已更新',
  });
  return globalStrategy;
}

/** 解析 ask/search 目标库：显式 id 须存在；缺省为全部已注册库。 */
export function resolveTargetCollections(collectionIds?: string[]): CollectionRecord[] {
  if (!collectionIds || collectionIds.length === 0) {
    const all = listCollectionRecords();
    if (all.length === 0) {
      throw badRequest('没有可用的知识库');
    }
    return all;
  }

  const unique = [...new Set(collectionIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw badRequest('collectionIds 不能为空');
  }
  return unique.map((id) => getCollectionRecord(id));
}

export function listCollectionRecords(): CollectionRecord[] {
  return [...handles.values()].map((handle) => handle.record);
}

export function getCollectionRecord(id: string): CollectionRecord {
  const handle = handles.get(id);
  if (!handle) {
    throw notFound('知识库不存在');
  }
  return handle.record;
}

export function createCollectionRecord(input: CreateCollectionInput): CollectionRecord {
  const name = input.name.trim();
  if (!name) {
    throw badRequest('知识库名称不能为空');
  }
  if (input.ingestMode !== 'incremental' && input.ingestMode !== 'full') {
    throw badRequest('ingestMode 必须是 incremental 或 full');
  }

  const id = `kb-${randomUUID()}`;
  const record: CollectionRecord = {
    id,
    name,
    description: input.description?.trim() ?? '',
    createdAt: new Date().toISOString(),
    ingestMode: input.ingestMode,
    lastIngest: null,
    strategy: defaultStrategy(id),
    documents: [],
  };
  handles.set(id, { record });
  persist();
  return record;
}

export function updateCollectionRecord(
  id: string,
  patch: { name?: string; description?: string },
): CollectionRecord {
  const record = getCollectionRecord(id);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) {
      throw badRequest('知识库名称不能为空');
    }
    record.name = name;
  }
  if (patch.description !== undefined) {
    record.description = patch.description;
  }
  persist();
  return record;
}

export async function removeCollectionRecord(id: string): Promise<void> {
  const handle = handles.get(id);
  if (!handle) {
    throw notFound('知识库不存在');
  }

  // collection.close() 会关 store 连接池；retriever 另有自己的池，必须单独关
  await handle.collection?.close();
  await handle.retriever?.close();

  const config = loadServerConfig();
  const tableName = tableNameOf(id);
  const legacyName = legacyDoublePrefixedTableName(id);
  const pool = new Pool({ connectionString: config.connectionString });
  try {
    await pool.query(`DROP TABLE IF EXISTS "public".${quoteSqlIdent(tableName)}`);
    if (legacyName !== tableName) {
      await pool.query(`DROP TABLE IF EXISTS "public".${quoteSqlIdent(legacyName)}`);
    }
  } finally {
    await pool.end();
  }

  handles.delete(id);
  persist();
}

async function ensureHandle(
  id: string,
): Promise<CollectionHandle & { collection: CollectionFacade; runtime: Runtime }> {
  const handle = handles.get(id);
  if (!handle) {
    throw notFound('知识库不存在');
  }

  if (handle.collection && handle.runtime) {
    return handle as CollectionHandle & { collection: CollectionFacade; runtime: Runtime };
  }

  const shared = getSharedStack();
  const tableName = await migrateLegacyVectorTable(shared.config.connectionString, id);
  const store = new PgVectorStoreAdapter({
    connectionString: shared.config.connectionString,
    tableName,
    dimension: shared.config.dimension,
    ensureTable: true,
  });
  const retriever = new PgVectorRuntimeRetrieverAdapter({
    id,
    connectionString: shared.config.connectionString,
    tableName,
    embedQuery: (query) => embedQuery(shared.embedder, query),
  });
  const runtime = buildRuntime({
    strategy: handle.record.strategy,
    retriever,
    generator: shared.generator,
    strategyModel: shared.strategyModel,
    observer: shared.observer,
  });
  const indexingBase: Omit<IndexingOptions, 'loader'> = {
    chunker: new SimpleChunker({ chunkSize: 500, overlap: 50 }),
    embedder: shared.embedder,
    store,
    mode: handle.record.ingestMode,
    observer: shared.observer,
    sourceIdResolver(document) {
      const source = document.metadata?.sourceId;
      return typeof source === 'string' && source.length > 0 ? source : document.id;
    },
    fingerprintResolver(document) {
      return fingerprintOf(document.content);
    },
  };
  const collection = createCollection({ indexing: indexingBase, runtime });

  handle.store = store;
  handle.retriever = retriever;
  handle.runtime = runtime;
  handle.collection = collection;
  handle.indexingBase = indexingBase;

  return handle as CollectionHandle & { collection: CollectionFacade; runtime: Runtime };
}

function rebuildRuntime(handle: CollectionHandle): void {
  if (!handle.retriever || !handle.indexingBase) {
    return;
  }
  const shared = getSharedStack();
  handle.runtime = buildRuntime({
    strategy: handle.record.strategy,
    retriever: handle.retriever,
    generator: shared.generator,
    strategyModel: shared.strategyModel,
    observer: shared.observer,
  });
  handle.collection = createCollection({
    indexing: handle.indexingBase,
    runtime: handle.runtime,
  });
}

export function getStrategyConfig(id: string): StrategyConfig {
  return getCollectionRecord(id).strategy;
}

/** @deprecated 查询链路已改用全局策略；保留供历史 state 字段兼容。 */
export function saveStrategyConfig(id: string, strategy: StrategyConfig): StrategyConfig {
  const handle = handles.get(id);
  if (!handle) {
    throw notFound('知识库不存在');
  }
  handle.record.strategy = {
    ...strategy,
    collectionId: id,
  };
  rebuildRuntime(handle);
  persist();
  recordActivity({
    kind: 'strategy',
    title: '策略已更新',
    collectionId: id,
    collectionName: handle.record.name,
  });
  return handle.record.strategy;
}

function reconcileDocuments(
  record: CollectionRecord,
  inputs: IngestDocumentInput[],
  sourceIdsInStore: Set<string>,
): void {
  const now = new Date().toISOString();
  for (const input of inputs) {
    const sourceId = sourceIdOf(input, input.id ?? randomUUID());
    const title = titleOf(input, sourceId);
    const fingerprint = fingerprintOf(input.content);
    const existing = record.documents.find((doc) => doc.sourceId === sourceId);
    const inStore = sourceIdsInStore.has(sourceId);
    const status = inStore
      ? existing?.fingerprint === fingerprint
        ? 'unchanged'
        : 'indexed'
      : 'failed';

    const next: StoredDocument = {
      id: existing?.id ?? sourceId,
      collectionId: record.id,
      sourceId,
      title,
      status,
      updatedAt: now,
      content: input.content,
      fingerprint,
      failReason: status === 'failed' ? '入库后未在向量库中找到对应源' : undefined,
    };

    if (existing) {
      Object.assign(existing, next);
    } else {
      record.documents.push(next);
    }
  }
}

export async function ingestDocuments(
  id: string,
  inputs: IngestDocumentInput[],
  mode?: IngestMode,
  chunking?: ChunkingConfig,
): Promise<IngestStats> {
  const filtered = inputs.filter((item) => item.content.trim().length > 0);
  if (filtered.length === 0) {
    throw badRequest('没有可入库的文本内容');
  }
  const handle = await ensureHandle(id);
  const documents = toDocuments(filtered);
  const chunker = buildChunker(chunking);
  const result = await runIndexing({
    ...handle.indexingBase!,
    loader: {
      async load() {
        return documents;
      },
    },
    chunker,
    mode: mode ?? handle.record.ingestMode,
    observer: getSharedStack().observer,
    trace: { tags: { collectionId: id, collectionName: handle.record.name } },
  });

  const sources = await handle.collection.listSources();
  const sourceIds = new Set(sources.map((item) => item.sourceId));
  reconcileDocuments(handle.record, filtered, sourceIds);

  const stats = toIngestStats(result);
  handle.record.lastIngest = {
    finishedAt: new Date().toISOString(),
    mode: mode ?? handle.record.ingestMode,
    stats,
  };
  persist();

  recordActivity({
    kind: 'ingest',
    title: ingestActivityTitle(stats),
    stats,
    collectionId: id,
    collectionName: handle.record.name,
  });
  await recordIngestTrace({
    id: `ing-${randomUUID()}`,
    collectionId: id,
    collectionName: handle.record.name,
    finishedAt: handle.record.lastIngest.finishedAt,
    mode: handle.record.lastIngest.mode,
    stats,
    success: stats.failed === 0,
  });

  return stats;
}

export function recommendIngestForCollection(
  id: string,
  documents: Array<{ metadata?: { title?: string; mimeType?: string } }>,
): IngestRecommendation {
  const record = getCollectionRecord(id);
  return recommendIngestConfig(documents, record.ingestMode);
}

/**
 * 为全局 ask/search 组装 runtime：多库 FanOut + 全局策略。
 * 每个子 retriever 的 id 设为 collectionId，供 routeDecision.targets 选路。
 */
export async function buildGlobalRuntime(
  collectionIds?: string[],
  strategyOverride?: StrategyConfig,
): Promise<{
  runtime: Runtime;
  targets: CollectionRecord[];
  strategy: StrategyConfig;
}> {
  const targets = resolveTargetCollections(collectionIds);
  const shared = getSharedStack();
  const strategy = strategyOverride ?? getGlobalStrategy();
  const retrievers = [];

  for (const record of targets) {
    const handle = await ensureHandle(record.id);
    if (!handle.retriever) {
      throw badRequest(`知识库 ${record.id} 尚未就绪`);
    }
    retrievers.push(handle.retriever);
  }

  const runtime = buildRuntime({
    strategy,
    retriever: retrievers[0]!,
    retrievers,
    routingTargets: targets.map((item) => item.id),
    generator: shared.generator,
    strategyModel: shared.strategyModel,
    observer: shared.observer,
  });

  return { runtime, targets, strategy };
}

export async function searchGlobal(
  query: string,
  topK: number | undefined,
  collectionIds?: string[],
  strategyOverride?: StrategyConfig,
): Promise<RuntimeSearchResult> {
  const { runtime, targets, strategy } = await buildGlobalRuntime(collectionIds, strategyOverride);
  const resolvedTopK =
    typeof topK === 'number' && Number.isInteger(topK) && topK > 0 ? topK : strategy.retrieval.topK;
  const scope = targets.length === 1 ? targets[0]! : null;

  return runtime.search(
    { query, metadata: { topK: resolvedTopK } },
    {
      requestId: randomUUID(),
      trace: {
        tags: {
          collectionId: scope?.id ?? 'global',
          collectionName: scope?.name ?? `${targets.length} 个知识库`,
          collectionIds: targets.map((item) => item.id).join(','),
        },
      },
    },
  );
}

/** 对 query 跑完整四段 pipeline（含 generation），供生成 judge 取完整 answer。 */
export async function runGlobal(
  query: string,
  collectionIds?: string[],
  strategyOverride?: StrategyConfig,
): Promise<RuntimeResult> {
  const { runtime, targets } = await buildGlobalRuntime(collectionIds, strategyOverride);
  const scope = targets.length === 1 ? targets[0]! : null;

  return runtime.run(
    { query },
    {
      requestId: randomUUID(),
      trace: {
        tags: {
          collectionId: scope?.id ?? 'global',
          collectionName: scope?.name ?? `${targets.length} 个知识库`,
          collectionIds: targets.map((item) => item.id).join(','),
        },
      },
    },
  );
}

export async function prepareGlobalAsk(
  _question: string,
  collectionIds?: string[],
): Promise<{
  runtime: Runtime;
  strategy: StrategyConfig;
  targets: CollectionRecord[];
}> {
  const { runtime, targets, strategy } = await buildGlobalRuntime(collectionIds);
  return { runtime, strategy, targets };
}

export async function retryDocument(collectionId: string, documentId: string): Promise<void> {
  const record = getCollectionRecord(collectionId);
  const doc = record.documents.find((item) => item.id === documentId);
  if (!doc) {
    throw notFound('文档不存在');
  }
  if (!doc.content.trim()) {
    throw badRequest('没有可重试的原文');
  }
  await ingestDocuments(
    collectionId,
    [
      {
        id: doc.id,
        content: doc.content,
        metadata: { title: doc.title, sourceId: doc.sourceId },
      },
    ],
    record.ingestMode,
  );
}

/**
 * 返回单文档详情（含入库登记的原文）。列表接口故意不带 content，避免整表膨胀。
 */
export function getDocumentDetail(collectionId: string, documentId: string): DocumentDetail {
  const record = getCollectionRecord(collectionId);
  const doc = record.documents.find((item) => item.id === documentId);
  if (!doc) {
    throw notFound('文档不存在');
  }
  const { fingerprint: _fingerprint, ...detail } = doc;
  return detail;
}

export async function removeDocument(collectionId: string, documentId: string): Promise<void> {
  const handle = await ensureHandle(collectionId);
  const index = handle.record.documents.findIndex((item) => item.id === documentId);
  if (index < 0) {
    throw notFound('文档不存在');
  }
  const doc = handle.record.documents[index]!;
  await handle.collection.deleteByFilters({ sourceIds: [doc.sourceId] });
  handle.record.documents.splice(index, 1);
  persist();
}

export function recordAskActivity(input: {
  collectionId: string;
  collectionName: string;
  question: string;
  citationCount: number;
}): void {
  recordActivity({
    kind: 'ask',
    title: `提问「${input.question.slice(0, 24)}${input.question.length > 24 ? '…' : ''}」`,
    detail: `已引用 ${input.citationCount} 段`,
    collectionId: input.collectionId,
    collectionName: input.collectionName,
  });
}

export async function closeAllCollections(): Promise<void> {
  for (const handle of handles.values()) {
    await handle.collection?.close();
    await handle.retriever?.close();
  }
  handles.clear();
}

export function getCollectionDetail(id: string) {
  return toCollectionDetail(getCollectionRecord(id));
}
