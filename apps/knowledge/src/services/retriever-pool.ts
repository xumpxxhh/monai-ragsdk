import { PgVectorRuntimeRetrieverAdapter } from '@monai-ragsdk/adapters';
import type { RuntimeRetriever } from '@monai-ragsdk/runtime';

import { embedQuery, getKnowledgeStack } from './stack.js';
import { tableNameFor } from './table-name.js';

const retrieverCache = new Map<string, PgVectorRuntimeRetrieverAdapter>();

/**
 * 按 collectionId 延迟创建 retriever；id 与控制台一致，供 routing targets 点名。
 */
export async function getRetrieverForCollection(collectionId: string): Promise<RuntimeRetriever> {
  const cached = retrieverCache.get(collectionId);
  if (cached) {
    return cached;
  }

  const { config, embedder } = getKnowledgeStack();
  const tableName = tableNameFor(collectionId);
  const retriever = new PgVectorRuntimeRetrieverAdapter({
    id: collectionId,
    connectionString: config.connectionString,
    tableName,
    embedQuery: (query) => embedQuery(embedder, query),
  });

  retrieverCache.set(collectionId, retriever);
  return retriever;
}

export async function closeRetrieverPool(): Promise<void> {
  for (const retriever of retrieverCache.values()) {
    await retriever.close();
  }
  retrieverCache.clear();
}
