import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MockEmbedder, defaultMetadataBuilder, runIndexing } from '@monai-ragsdk/indexing';

import {
  LangChainMarkdownDirectoryLoader,
  LangChainRecursiveCharacterTextSplitterAdapter,
  type PgVectorStoreAdapterOptions,
  PgVectorStoreAdapter,
} from '../src/index.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const fixtureDirectory = path.join(currentDirectory, 'fixtures');
const vectorDimension = Number(process.env.PGVECTOR_DIMENSION ?? 6);
const postgresPort = Number(process.env.PGVECTOR_PORT ?? 5432);
const schema = process.env.PGVECTOR_SCHEMA ?? 'public';
const tableName = process.env.PGVECTOR_TABLE_NAME ?? 'monai_ragsdk_pgvector_demo';
const connectionOptions = resolveConnectionOptions();

const loader = new LangChainMarkdownDirectoryLoader({
  path: fixtureDirectory,
  idPrefix: 'demo-doc',
});

const chunker = new LangChainRecursiveCharacterTextSplitterAdapter({
  chunkSize: 32,
  chunkOverlap: 8,
});

const store = new PgVectorStoreAdapter({
  ...connectionOptions,
  schema,
  tableName,
  dimension: vectorDimension,
  ensureTable: true,
});

try {
  const result = await runIndexing({
    loader,
    chunker,
    mode: 'incremental',
    sourceIdResolver(document) {
      return `demo-source:${document.id}`;
    },
    fingerprintResolver(document) {
      return `demo-fingerprint:${document.id}`;
    },
    metadataBuilder(document, chunk) {
      return {
        ...defaultMetadataBuilder(document, chunk),
        content: chunk.content,
      };
    },
    embedder: new MockEmbedder({ dimension: vectorDimension }),
    store,
  });

  console.log(
    JSON.stringify(
      {
        result,
        pgvector: {
          connectionStringConfigured: 'connectionString' in connectionOptions,
          host: 'host' in connectionOptions ? (connectionOptions.host ?? null) : null,
          port:
            'port' in connectionOptions
              ? (connectionOptions.port ?? (Number.isNaN(postgresPort) ? 5432 : postgresPort))
              : null,
          database: 'database' in connectionOptions ? (connectionOptions.database ?? null) : null,
          schema,
          tableName,
          vectorDimension,
          ensureTable: true,
        },
      },
      null,
      2,
    ),
  );
} finally {
  // adapter 自建 Pool，用完必须关，否则 demo 进程会挂住
  await store.close();
}

function resolveConnectionOptions(): Pick<
  PgVectorStoreAdapterOptions,
  'connectionString' | 'host' | 'port' | 'user' | 'password' | 'database'
> {
  const connectionString = process.env.PGVECTOR_CONNECTION_STRING?.trim();

  if (connectionString) {
    return {
      connectionString,
    };
  }

  const host = process.env.PGVECTOR_HOST?.trim() ?? '127.0.0.1';
  const user = process.env.PGVECTOR_USER?.trim();
  const password = process.env.PGVECTOR_PASSWORD;
  const database = process.env.PGVECTOR_DATABASE?.trim();

  if (!user || !database || typeof password !== 'string') {
    throw new Error(
      [
        'pgvector demo requires PostgreSQL credentials.',
        'Provide either PGVECTOR_CONNECTION_STRING, or set PGVECTOR_USER, PGVECTOR_PASSWORD, and PGVECTOR_DATABASE.',
        'Example:',
        'PGVECTOR_CONNECTION_STRING=postgresql://postgres:postgres@127.0.0.1:5432/postgres pnpm --filter @monai-ragsdk/adapters demo:pgvector-store',
      ].join('\n'),
    );
  }

  return {
    host,
    port: Number.isNaN(postgresPort) ? 5432 : postgresPort,
    user,
    password,
    database,
  };
}
