import type { Chunk, JsonValue } from "@monai-ragsdk/core";
import {
  createIndexingRetrievalCandidate,
  filterRetrievalCandidatesByIndexingFilters,
  type RetrievalCandidate,
  type RetrievalRequest,
  type RuntimeContext,
  type RuntimeRetrievalResult,
  type RuntimeRetriever,
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

/**
 * pgvector 查询期 retriever：向量召回与关键词召回并行，再按 RRF 融合。
 * SQL 不表达 Phase D filter；融合后再复用 runtime 统一过滤，避免和 LangChain 路径语义分叉。
 */
export class PgVectorRuntimeRetrieverAdapter implements RuntimeRetriever {
  readonly #client: PgRuntimeRetrieverClientLike;
  readonly #ownedPool: Pool | undefined;
  readonly #schema: string;
  readonly #tableName: string;
  readonly #idColumn: string;
  readonly #vectorColumn: string;
  readonly #metadataColumn: string;
  readonly #contentColumn: string;
  readonly #contentMetadataKey: string;
  readonly #embedQuery: (query: string) => Promise<number[]>;

  constructor(options: PgVectorRuntimeRetrieverAdapterOptions) {
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

    // 召回池大于 topK，否则 RRF 与 filter 之后容易凑不满最终结果
    const [vectorCandidates, keywordCandidates] = await Promise.all([
      this.#retrieveByEmbedding(query, request, DEFAULT_CANDIDATE_POOL_SIZE),
      this.#retrieveByKeyword(query, request, DEFAULT_CANDIDATE_POOL_SIZE),
    ]);

    const fusedCandidates = this.#fuseByRRF(
      vectorCandidates,
      keywordCandidates,
      request,
    );
    const filteredCandidates = filterRetrievalCandidatesByIndexingFilters(
      fusedCandidates,
      request.filters,
    ).slice(0, topK);

    return {
      candidates: filteredCandidates,
      retrievalMetadata: {
        provider: "pgvector",
        topK,
        vectorCandidateCount: vectorCandidates.length,
        keywordCandidateCount: keywordCandidates.length,
        fusedCandidateCount: fusedCandidates.length,
        filteredCandidateCount: filteredCandidates.length,
      },
    };
  }

  /** 仅关闭 adapter 自己创建的 Pool；注入的 client 由调用方负责。 */
  async close(): Promise<void> {
    await this.#ownedPool?.end();
  }

  async #retrieveByEmbedding(
    query: string,
    request: RetrievalRequest,
    topK: number,
  ): Promise<RetrievalCandidate[]> {
    const queryVector = await this.#embedQuery(query);
    const rows = await this.#client.query<RetrievalRow>(
      `SELECT ${quoteIdentifier(this.#idColumn)} AS id, ${quoteIdentifier(this.#contentColumn)} AS content, ${quoteIdentifier(this.#metadataColumn)} AS metadata, 1 - (${quoteIdentifier(this.#vectorColumn)} <=> $1::vector) AS score FROM ${this.#getQuotedTableName()} ORDER BY ${quoteIdentifier(this.#vectorColumn)} <=> $1::vector LIMIT $2`,
      [formatPgVector(queryVector), topK],
    );

    return this.#rowsToCandidates(rows.rows, request, "vector");
  }

  async #retrieveByKeyword(
    query: string,
    request: RetrievalRequest,
    topK: number,
  ): Promise<RetrievalCandidate[]> {
    const rows = await this.#client.query<RetrievalRow>(
      `SELECT ${quoteIdentifier(this.#idColumn)} AS id, ${quoteIdentifier(this.#contentColumn)} AS content, ${quoteIdentifier(this.#metadataColumn)} AS metadata, ts_rank(tsv, plainto_tsquery('simple', $1)) AS score FROM ${this.#getQuotedTableName()} WHERE tsv @@ plainto_tsquery('simple', $1) ORDER BY score DESC LIMIT $2`,
      [query, topK],
    );

    return this.#rowsToCandidates(rows.rows, request, "keyword");
  }

  /** 先按召回池做 RRF，再交给调用方截断 topK；否则 filter 后容易凑不满。 */
  #fuseByRRF(
    vectorCandidates: RetrievalCandidate[],
    keywordCandidates: RetrievalCandidate[],
    request: RetrievalRequest,
    k: number = DEFAULT_RRF_K,
  ): RetrievalCandidate[] {
    const rrfScores = new Map<string, number>();
    const candidateMap = new Map<string, RetrievalCandidate>();

    for (const [rank, candidate] of vectorCandidates.entries()) {
      const id = candidate.chunk.id;
      rrfScores.set(id, (rrfScores.get(id) ?? 0) + 1 / (k + rank + 1));
      candidateMap.set(id, candidate);
    }

    for (const [rank, candidate] of keywordCandidates.entries()) {
      const id = candidate.chunk.id;
      rrfScores.set(id, (rrfScores.get(id) ?? 0) + 1 / (k + rank + 1));
      candidateMap.set(id, candidateMap.get(id) ?? candidate);
    }

    return [...rrfScores.entries()]
      .sort((left, right) => right[1] - left[1])
      .flatMap(([id, score]) => {
        const candidate = candidateMap.get(id);

        if (!candidate) {
          return [];
        }

        return [
          createIndexingRetrievalCandidate(candidate.chunk, {
            score,
            route: request.route,
            strategy: request.strategy,
            retrieverMetadata: {
              provider: "pgvector",
              searchType: "hybrid",
            },
          }),
        ];
      });
  }

  #rowsToCandidates(
    rows: RetrievalRow[],
    request: RetrievalRequest,
    searchType: "vector" | "keyword",
  ): RetrievalCandidate[] {
    return rows.map((row) => {
      const metadata = row.metadata ?? {};
      // content 列可能为空：写入侧只在 metadata.content 存在时尽力落原文
      const chunk: Chunk = {
        id: row.id,
        content:
          row.content ??
          readStringMetadata(metadata, this.#contentMetadataKey) ??
          "",
        metadata,
      };

      return createIndexingRetrievalCandidate(chunk, {
        score: readScore(row.score),
        route: request.route,
        strategy: request.strategy,
        retrieverMetadata: {
          provider: "pgvector",
          searchType,
        },
      });
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
