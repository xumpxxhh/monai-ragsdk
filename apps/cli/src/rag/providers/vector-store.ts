import { PgVectorStoreAdapter } from '@monai-ragsdk/adapters';
import { MemoryVectorStore, type VectorStore } from '@monai-ragsdk/indexing';

import type { VectorStoreConfig } from '../../config/schema.js';

export type CreatedVectorStore = {
  store: VectorStore;
  memoryStore?: MemoryVectorStore;
};

export function createVectorStore(
  config: VectorStoreConfig,
  dimension: number,
): CreatedVectorStore {
  if (config.provider === 'pgvector') {
    return {
      store: new PgVectorStoreAdapter({
        connectionString: config.connectionString,
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        schema: config.schema,
        tableName: config.tableName,
        ensureTable: config.ensureTable,
        dimension,
      }),
    };
  }

  const memoryStore = new MemoryVectorStore();

  return {
    store: memoryStore,
    memoryStore,
  };
}
