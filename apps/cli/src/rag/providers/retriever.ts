import { PgVectorRuntimeRetrieverAdapter } from '@monai-ragsdk/adapters';
import type { Embedder } from '@monai-ragsdk/indexing';
import type { RuntimeRetriever } from '@monai-ragsdk/runtime';

import type { PgVectorStoreConfig } from '../../config/schema.js';
import { embedQuery } from '../../utils/embed-query.js';

export function createPgVectorRuntimeRetriever(input: {
  config: PgVectorStoreConfig;
  embedder: Embedder;
}): RuntimeRetriever {
  return new PgVectorRuntimeRetrieverAdapter({
    connectionString: input.config.connectionString,
    host: input.config.host,
    port: input.config.port,
    user: input.config.user,
    password: input.config.password,
    database: input.config.database,
    schema: input.config.schema,
    tableName: input.config.tableName,
    embedQuery: async (query: string) => embedQuery(input.embedder, query),
  });
}
