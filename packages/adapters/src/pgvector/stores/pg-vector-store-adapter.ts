import type { Vector } from "@monai-ragsdk/core";
import type {
  VectorStore,
  VectorStoreDeleteFilter,
  VectorStoreSourceRecord,
  VectorStoreWriteContext,
} from "@monai-ragsdk/indexing";
import { Pool, type PoolConfig } from "pg";

import { normalizeJsonObject } from "../../shared/json.js";

type PgConnectionOptions = Pick<
  PoolConfig,
  | "connectionString"
  | "host"
  | "port"
  | "user"
  | "password"
  | "database"
  | "ssl"
  | "max"
  | "idleTimeoutMillis"
  | "connectionTimeoutMillis"
>;

type PgQueryResultLike<Row = Record<string, unknown>> = {
  rowCount?: number | null;
  rows?: Row[];
};

export type PgClientLike = {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResultLike<Row>>;
};

export type PgVectorStoreAdapterOptions = PgConnectionOptions & {
  schema?: string;
  tableName: string;
  idColumn?: string;
  vectorColumn?: string;
  metadataColumn?: string;
  contentColumn?: string;
  sourceIdColumn?: string;
  fingerprintColumn?: string;
  contentMetadataKey?: string;
  dimension?: number;
  ensureTable?: boolean;
  client?: PgClientLike;
};

const DEFAULT_SCHEMA = "public";
const DEFAULT_ID_COLUMN = "id";
const DEFAULT_VECTOR_COLUMN = "embedding";
const DEFAULT_METADATA_COLUMN = "metadata";
const DEFAULT_CONTENT_COLUMN = "content";
const DEFAULT_SOURCE_ID_COLUMN = "source_id";
const DEFAULT_FINGERPRINT_COLUMN = "fingerprint";
const DEFAULT_CONTENT_METADATA_KEY = "content";

/**
 * PostgreSQL + pgvector 写入适配：upsert / deleteByFilter / listSourceRecords。
 * 查询期不走本类，由 PgVectorRuntimeRetrieverAdapter 负责。
 */
export class PgVectorStoreAdapter implements VectorStore {
  readonly #client: PgClientLike;
  readonly #ownedPool: Pool | undefined;
  readonly #schema: string;
  readonly #tableName: string;
  readonly #idColumn: string;
  readonly #vectorColumn: string;
  readonly #metadataColumn: string;
  readonly #contentColumn: string;
  readonly #sourceIdColumn: string;
  readonly #fingerprintColumn: string;
  readonly #contentMetadataKey: string;
  readonly #ensureTable: boolean;

  #initializedPromise: Promise<void> | undefined;
  #dimension: number | undefined;

  constructor(options: PgVectorStoreAdapterOptions) {
    if (options.client) {
      this.#client = options.client;
      this.#ownedPool = undefined;
    } else {
      const pool = new Pool(toPoolConfig(options));
      this.#client = pool;
      this.#ownedPool = pool;
    }
    this.#schema = validateIdentifier(
      options.schema ?? DEFAULT_SCHEMA,
      "schema",
    );
    this.#tableName = validateIdentifier(options.tableName, "tableName");
    this.#idColumn = validateIdentifier(
      options.idColumn ?? DEFAULT_ID_COLUMN,
      "idColumn",
    );
    this.#vectorColumn = validateIdentifier(
      options.vectorColumn ?? DEFAULT_VECTOR_COLUMN,
      "vectorColumn",
    );
    this.#metadataColumn = validateIdentifier(
      options.metadataColumn ?? DEFAULT_METADATA_COLUMN,
      "metadataColumn",
    );
    this.#contentColumn = validateIdentifier(
      options.contentColumn ?? DEFAULT_CONTENT_COLUMN,
      "contentColumn",
    );
    this.#sourceIdColumn = validateIdentifier(
      options.sourceIdColumn ?? DEFAULT_SOURCE_ID_COLUMN,
      "sourceIdColumn",
    );
    this.#fingerprintColumn = validateIdentifier(
      options.fingerprintColumn ?? DEFAULT_FINGERPRINT_COLUMN,
      "fingerprintColumn",
    );
    this.#contentMetadataKey =
      options.contentMetadataKey ?? DEFAULT_CONTENT_METADATA_KEY;
    this.#ensureTable = options.ensureTable ?? false;
    this.#dimension = options.dimension;

    if (this.#dimension !== undefined && this.#dimension <= 0) {
      throw new Error("dimension must be greater than 0");
    }
  }

  async upsert(
    vectors: Vector[],
    _context?: VectorStoreWriteContext,
  ): Promise<void> {
    if (vectors.length === 0) {
      return;
    }

    const batchDimension = assertConsistentDimensions(vectors);
    this.#assertExpectedDimension(batchDimension);
    await this.#initialize(batchDimension);

    const quotedTable = this.#getQuotedTableName();
    const quotedIdColumn = quoteIdentifier(this.#idColumn);
    const quotedVectorColumn = quoteIdentifier(this.#vectorColumn);
    const quotedMetadataColumn = quoteIdentifier(this.#metadataColumn);
    const quotedContentColumn = quoteIdentifier(this.#contentColumn);
    const quotedSourceIdColumn = quoteIdentifier(this.#sourceIdColumn);
    const quotedFingerprintColumn = quoteIdentifier(this.#fingerprintColumn);

    const values: unknown[] = [];
    const rowsSql = vectors.map((vector, index) => {
      const offset = index * 6;

      values.push(
        vector.id,
        formatPgVector(vector.values),
        toJsonbValue(vector.metadata),
        readStringMetadata(vector.metadata, this.#contentMetadataKey) ?? null,
        readStringMetadata(vector.metadata, "sourceId") ?? null,
        readStringMetadata(vector.metadata, "fingerprint") ?? null,
      );

      return `($${offset + 1}, $${offset + 2}::vector, $${offset + 3}::jsonb, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
    });

    await this.#client.query(
      `INSERT INTO ${quotedTable} (${quotedIdColumn}, ${quotedVectorColumn}, ${quotedMetadataColumn}, ${quotedContentColumn}, ${quotedSourceIdColumn}, ${quotedFingerprintColumn}) VALUES ${rowsSql.join(", ")} ON CONFLICT (${quotedIdColumn}) DO UPDATE SET ${quotedVectorColumn} = EXCLUDED.${quotedVectorColumn}, ${quotedMetadataColumn} = EXCLUDED.${quotedMetadataColumn}, ${quotedContentColumn} = EXCLUDED.${quotedContentColumn}, ${quotedSourceIdColumn} = EXCLUDED.${quotedSourceIdColumn}, ${quotedFingerprintColumn} = EXCLUDED.${quotedFingerprintColumn}`,
      values,
    );
  }

  async deleteByFilter(filter: VectorStoreDeleteFilter): Promise<void> {
    const sourceIds = filter.sourceIds;
    const fingerprints = filter.fingerprints;

    if (!sourceIds && !fingerprints) {
      return;
    }

    if (
      (sourceIds && sourceIds.length === 0) ||
      (fingerprints && fingerprints.length === 0)
    ) {
      return;
    }

    await this.#initialize(this.#dimension);

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (sourceIds) {
      values.push(sourceIds);
      conditions.push(
        `${quoteIdentifier(this.#sourceIdColumn)} = ANY($${values.length}::text[])`,
      );
    }

    if (fingerprints) {
      values.push(fingerprints);
      conditions.push(
        `${quoteIdentifier(this.#fingerprintColumn)} = ANY($${values.length}::text[])`,
      );
    }

    if (conditions.length === 0) {
      return;
    }

    await this.#client.query(
      `DELETE FROM ${this.#getQuotedTableName()} WHERE ${conditions.join(" AND ")}`,
      values,
    );
  }

  async listSourceRecords(): Promise<VectorStoreSourceRecord[]> {
    await this.#initialize(this.#dimension);

    const result = await this.#client.query<{
      source_id: string | null;
      fingerprint: string | null;
    }>(
      `SELECT DISTINCT ${quoteIdentifier(this.#sourceIdColumn)} AS source_id, ${quoteIdentifier(this.#fingerprintColumn)} AS fingerprint FROM ${this.#getQuotedTableName()} WHERE ${quoteIdentifier(this.#sourceIdColumn)} IS NOT NULL`,
    );

    return (result.rows ?? [])
      .filter((row) => typeof row.source_id === "string" && row.source_id.length > 0)
      .map((row) => ({
        sourceId: row.source_id as string,
        ...(typeof row.fingerprint === "string" && row.fingerprint.length > 0
          ? { fingerprint: row.fingerprint }
          : {}),
      }));
  }

  /** 仅关闭 adapter 自己创建的 Pool；注入的 client 由调用方负责。 */
  async close(): Promise<void> {
    await this.#ownedPool?.end();
  }

  async #initialize(batchDimension?: number): Promise<void> {
    if (!this.#ensureTable) {
      return;
    }

    if (!this.#initializedPromise) {
      this.#initializedPromise = this.#ensureSchemaAndTable(
        batchDimension,
      ).catch((error) => {
        this.#initializedPromise = undefined;
        throw error;
      });
    }

    await this.#initializedPromise;
  }

  async #ensureSchemaAndTable(batchDimension?: number): Promise<void> {
    const dimension = this.#dimension ?? batchDimension;

    if (!dimension || dimension <= 0) {
      throw new Error(
        "PgVectorStoreAdapter requires a positive dimension to create the pgvector table",
      );
    }

    this.#dimension = dimension;

    const quotedTable = this.#getQuotedTableName();
    const quotedIdColumn = quoteIdentifier(this.#idColumn);
    const quotedVectorColumn = quoteIdentifier(this.#vectorColumn);
    const quotedMetadataColumn = quoteIdentifier(this.#metadataColumn);
    const quotedContentColumn = quoteIdentifier(this.#contentColumn);
    const quotedSourceIdColumn = quoteIdentifier(this.#sourceIdColumn);
    const quotedFingerprintColumn = quoteIdentifier(this.#fingerprintColumn);
    const quotedSchema = quoteIdentifier(this.#schema);

    await this.#client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await this.#client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
    await this.#client.query(
      `CREATE TABLE IF NOT EXISTS ${quotedTable} (${quotedIdColumn} TEXT PRIMARY KEY, ${quotedContentColumn} TEXT, ${quotedVectorColumn} VECTOR(${dimension}) NOT NULL, ${quotedMetadataColumn} JSONB, ${quotedSourceIdColumn} TEXT, ${quotedFingerprintColumn} TEXT, tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', coalesce(${quotedContentColumn}, ''))) STORED, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
    );
    await this.#client.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.#tableName}_${this.#sourceIdColumn}_idx`)} ON ${quotedTable} (${quoteIdentifier(this.#sourceIdColumn)})`,
    );
    await this.#client.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.#tableName}_${this.#fingerprintColumn}_idx`)} ON ${quotedTable} (${quoteIdentifier(this.#fingerprintColumn)})`,
    );
    await this.#client.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.#tableName}_tsv_idx`)} ON ${quotedTable} USING GIN(tsv)`,
    );
    // 查询走 <=> 余弦距离；HNSW 无需 IVFFlat 的 lists 调参，适合默认建表路径
    await this.#client.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.#tableName}_${this.#vectorColumn}_hnsw_idx`)} ON ${quotedTable} USING hnsw (${quotedVectorColumn} vector_cosine_ops)`,
    );
  }

  #assertExpectedDimension(batchDimension: number): void {
    if (this.#dimension !== undefined && batchDimension !== this.#dimension) {
      throw new Error(
        `PgVectorStoreAdapter requires vectors to match configured dimension ${this.#dimension}: received ${batchDimension}`,
      );
    }
  }

  #getQuotedTableName(): string {
    return `${quoteIdentifier(this.#schema)}.${quoteIdentifier(this.#tableName)}`;
  }
}

function toPoolConfig(options: PgVectorStoreAdapterOptions): PoolConfig {
  return {
    connectionString: options.connectionString,
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    ssl: options.ssl,
    max: options.max,
    idleTimeoutMillis: options.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
  };
}

function validateIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${label} must be a valid SQL identifier`);
  }

  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function assertConsistentDimensions(vectors: Vector[]): number {
  const expectedDimension = vectors[0]?.values.length ?? 0;

  for (const vector of vectors) {
    if (vector.values.length !== expectedDimension) {
      throw new Error(
        `PgVectorStoreAdapter requires all vectors in a batch to share the same dimension: expected ${expectedDimension}, received ${vector.values.length} for vector ${vector.id}`,
      );
    }
  }

  if (expectedDimension <= 0) {
    throw new Error(
      "PgVectorStoreAdapter requires vectors to have a positive dimension",
    );
  }

  return expectedDimension;
}

function formatPgVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

function toJsonbValue(metadata: Vector["metadata"]): string | null {
  const normalizedMetadata = normalizeJsonObject(
    metadata as Record<string, unknown> | undefined,
  );

  return normalizedMetadata ? JSON.stringify(normalizedMetadata) : null;
}

function readStringMetadata(
  metadata: Vector["metadata"],
  key: string,
): string | undefined {
  const value = metadata?.[key as keyof NonNullable<Vector["metadata"]>];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}
