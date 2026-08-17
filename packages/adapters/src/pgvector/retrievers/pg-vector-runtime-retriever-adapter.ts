import type { Chunk, JsonValue } from "@monai-ragsdk/core";
import type {
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
  RuntimeRetrievalResult,
  RuntimeRetriever,
} from "@monai-ragsdk/runtime";
import { Pool, type PoolConfig } from "pg";

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

type PgQueryResultLike<Row> = {
  rows: Row[];
};

export type PgRuntimeRetrieverClientLike = {
  query<Row>(text: string, values?: readonly unknown[]): Promise<PgQueryResultLike<Row>>;
};

export type PgVectorRuntimeRetrieverAdapterOptions = PgConnectionOptions & {
  schema?: string;
  tableName: string;
  idColumn?: string;
  vectorColumn?: string;
  metadataColumn?: string;
  contentColumn?: string;
  contentMetadataKey?: string;
  client?: PgRuntimeRetrieverClientLike;
  embedQuery(query: string): Promise<number[]>;
};

type RetrievalRow = {
  id: string;
  content: string | null;
  metadata: Record<string, JsonValue> | null;
  score: number | string | null;
};

const DEFAULT_SCHEMA = "public";
const DEFAULT_ID_COLUMN = "id";
const DEFAULT_VECTOR_COLUMN = "embedding";
const DEFAULT_METADATA_COLUMN = "metadata";
const DEFAULT_CONTENT_COLUMN = "content";
const DEFAULT_CONTENT_METADATA_KEY = "content";
const DEFAULT_CANDIDATE_POOL_SIZE = 100;
const DEFAULT_RRF_K = 60;

export class PgVectorRuntimeRetrieverAdapter implements RuntimeRetriever {
  readonly #client: PgRuntimeRetrieverClientLike;
  readonly #schema: string;
  readonly #tableName: string;
  readonly #idColumn: string;
  readonly #vectorColumn: string;
  readonly #metadataColumn: string;
  readonly #contentColumn: string;
  readonly #contentMetadataKey: string;
  readonly #embedQuery: (query: string) => Promise<number[]>;

  constructor(options: PgVectorRuntimeRetrieverAdapterOptions) {
    this.#client = options.client ?? new Pool(toPoolConfig(options));
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
    this.#contentMetadataKey =
      options.contentMetadataKey ?? DEFAULT_CONTENT_METADATA_KEY;
    this.#embedQuery = options.embedQuery;
  }

  async retrieve(
    request: RetrievalRequest,
    _context: RuntimeContext,
  ): Promise<RuntimeRetrievalResult> {
    const query = request.effectiveQuery.query;
    const topK = request.budget?.maxChunks ?? 3;
    const candidatePoolSize = DEFAULT_CANDIDATE_POOL_SIZE;

    const [vectorCandidates, keywordCandidates] = await Promise.all([
      this.#retrieveByEmbedding(query, candidatePoolSize),
      this.#retrieveByKeyword(query, candidatePoolSize),
    ]);

    const fusedCandidates = this.#fuseByRRF(
      vectorCandidates,
      keywordCandidates,
      topK,
    );

    return {
      candidates: fusedCandidates,
      retrievalMetadata: {
        provider: "pgvector",
        topK,
        vectorCandidateCount: vectorCandidates.length,
        keywordCandidateCount: keywordCandidates.length,
        fusedCandidateCount: fusedCandidates.length,
      },
    };
  }

  async #retrieveByEmbedding(
    query: string,
    topK: number,
  ): Promise<RetrievalCandidate[]> {
    const queryVector = await this.#embedQuery(query);
    const rows = await this.#client.query<RetrievalRow>(
      `SELECT ${quoteIdentifier(this.#idColumn)} AS id, ${quoteIdentifier(this.#contentColumn)} AS content, ${quoteIdentifier(this.#metadataColumn)} AS metadata, 1 - (${quoteIdentifier(this.#vectorColumn)} <=> $1::vector) AS score FROM ${this.#getQuotedTableName()} ORDER BY ${quoteIdentifier(this.#vectorColumn)} <=> $1::vector LIMIT $2`,
      [formatPgVector(queryVector), topK],
    );

    return this.#rowsToCandidates(rows.rows);
  }

  async #retrieveByKeyword(
    query: string,
    topK: number,
  ): Promise<RetrievalCandidate[]> {
    const rows = await this.#client.query<RetrievalRow>(
      `SELECT ${quoteIdentifier(this.#idColumn)} AS id, ${quoteIdentifier(this.#contentColumn)} AS content, ${quoteIdentifier(this.#metadataColumn)} AS metadata, ts_rank(tsv, plainto_tsquery('simple', $1)) AS score FROM ${this.#getQuotedTableName()} WHERE tsv @@ plainto_tsquery('simple', $1) ORDER BY score DESC LIMIT $2`,
      [query, topK],
    );

    return this.#rowsToCandidates(rows.rows);
  }

  #fuseByRRF(
    vectorCandidates: RetrievalCandidate[],
    keywordCandidates: RetrievalCandidate[],
    topK: number,
    k: number = DEFAULT_RRF_K,
  ): RetrievalCandidate[] {
    const rrfScores = new Map<string, number>();
    const chunkMap = new Map<string, Chunk>();
    const metadataMap = new Map<
      string,
      { sourceId?: string; fingerprint?: string }
    >();

    for (let rank = 0; rank < vectorCandidates.length; rank++) {
      const candidate = vectorCandidates[rank];
      const id = candidate.chunk.id;
      rrfScores.set(id, (rrfScores.get(id) || 0) + 1 / (k + rank + 1));
      chunkMap.set(id, candidate.chunk);
      metadataMap.set(id, {
        sourceId: candidate.sourceId,
        fingerprint: candidate.fingerprint,
      });
    }

    for (let rank = 0; rank < keywordCandidates.length; rank++) {
      const candidate = keywordCandidates[rank];
      const id = candidate.chunk.id;
      rrfScores.set(id, (rrfScores.get(id) || 0) + 1 / (k + rank + 1));
      chunkMap.set(id, candidate.chunk);
      metadataMap.set(id, {
        sourceId: candidate.sourceId,
        fingerprint: candidate.fingerprint,
      });
    }

    return [...rrfScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id, score]) => ({
        chunk: chunkMap.get(id)!,
        score,
        sourceId: metadataMap.get(id)?.sourceId,
        fingerprint: metadataMap.get(id)?.fingerprint,
        retrieverMetadata: {
          provider: "pgvector",
          searchType: "hybrid",
        },
      }));
  }

  #rowsToCandidates(rows: RetrievalRow[]): RetrievalCandidate[] {
    return rows.map((row) => {
      const metadata = row.metadata ?? {};
      const chunk: Chunk = {
        id: row.id,
        content:
          row.content ??
          readStringMetadata(metadata, this.#contentMetadataKey) ??
          "",
        metadata,
      };

      return {
        chunk,
        score: readScore(row.score),
        sourceId: readStringMetadata(metadata, "sourceId"),
        fingerprint: readStringMetadata(metadata, "fingerprint"),
        retrieverMetadata: {
          provider: "pgvector",
        },
      };
    });
  }

  #getQuotedTableName(): string {
    return `${quoteIdentifier(this.#schema)}.${quoteIdentifier(this.#tableName)}`;
  }
}

function toPoolConfig(options: PgVectorRuntimeRetrieverAdapterOptions): PoolConfig {
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

function formatPgVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

function readScore(value: number | string | null): number | undefined {
  if (typeof value === "number") {
    return Number(value.toFixed(6));
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(6)) : undefined;
  }

  return undefined;
}

function readStringMetadata(
  metadata: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
