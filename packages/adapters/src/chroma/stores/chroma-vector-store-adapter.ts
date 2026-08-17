import type { JsonValue, Vector } from "@monai-ragsdk/core";
import type { VectorStore, VectorStoreWriteContext } from "@monai-ragsdk/indexing";
import {
  ChromaClient,
  type ChromaClientArgs,
  type Collection,
  type CollectionMetadata,
  type CreateCollectionConfiguration,
  type Metadata as ChromaMetadata,
} from "chromadb";

import { normalizeJsonObject } from "../../shared/json.js";

type ChromaConnectionOptions = Pick<
  ChromaClientArgs,
  "host" | "port" | "ssl" | "tenant" | "database" | "headers"
>;

type ChromaCollectionLike = Pick<Collection, "upsert">;
type ChromaClientLike = Pick<ChromaClient, "getOrCreateCollection">;

export type ChromaVectorStoreAdapterOptions = ChromaConnectionOptions & {
  collectionName: string;
  collectionMetadata?: CollectionMetadata;
  collectionConfiguration?: CreateCollectionConfiguration;
  client?: ChromaClientLike;
};

export class ChromaVectorStoreAdapter implements VectorStore {
  readonly #client: ChromaClientLike;
  readonly #collectionName: string;
  readonly #collectionMetadata: CollectionMetadata | undefined;
  readonly #collectionConfiguration: CreateCollectionConfiguration | undefined;

  #collectionPromise: Promise<ChromaCollectionLike> | undefined;

  constructor(options: ChromaVectorStoreAdapterOptions) {
    this.#client = options.client ?? new ChromaClient(toClientArgs(options));
    this.#collectionName = options.collectionName;
    this.#collectionMetadata = options.collectionMetadata;
    this.#collectionConfiguration = options.collectionConfiguration;
  }

  async upsert(
    vectors: Vector[],
    _context?: VectorStoreWriteContext,
  ): Promise<void> {
    if (vectors.length === 0) {
      return;
    }

    assertConsistentDimensions(vectors);

    const collection = await this.#getCollection();
    const metadatas = vectors.map((vector) =>
      toChromaMetadata(vector.metadata),
    );
    const shouldIncludeMetadata = metadatas.some(
      (metadata) => metadata !== undefined,
    );

    await collection.upsert({
      ids: vectors.map((vector) => vector.id),
      embeddings: vectors.map((vector) => vector.values),
      metadatas: shouldIncludeMetadata
        ? metadatas.map((metadata) => metadata ?? {})
        : undefined,
    });
  }

  async #getCollection(): Promise<ChromaCollectionLike> {
    if (!this.#collectionPromise) {
      this.#collectionPromise = this.#client
        .getOrCreateCollection({
          name: this.#collectionName,
          metadata: this.#collectionMetadata,
          configuration: this.#collectionConfiguration,
          embeddingFunction: null,
        })
        .catch((error) => {
          this.#collectionPromise = undefined;
          throw error;
        });
    }

    return this.#collectionPromise;
  }
}

function toClientArgs(
  options: ChromaVectorStoreAdapterOptions,
): Partial<ChromaClientArgs> {
  return {
    host: options.host,
    port: options.port,
    ssl: options.ssl,
    tenant: options.tenant,
    database: options.database,
    headers: options.headers,
  };
}

function assertConsistentDimensions(vectors: Vector[]): void {
  const expectedDimension = vectors[0]?.values.length ?? 0;

  for (const vector of vectors) {
    if (vector.values.length !== expectedDimension) {
      throw new Error(
        `ChromaVectorStoreAdapter requires all vectors in a batch to share the same dimension: expected ${expectedDimension}, received ${vector.values.length} for vector ${vector.id}`,
      );
    }
  }
}

function toChromaMetadata(
  metadata: Vector["metadata"],
): ChromaMetadata | undefined {
  const normalizedMetadata = normalizeJsonObject(
    metadata as Record<string, unknown> | undefined,
  );

  if (!normalizedMetadata) {
    return undefined;
  }

  const chromaMetadataEntries = Object.entries(normalizedMetadata).map(
    ([key, value]) => [key, toChromaMetadataValue(value)] as const,
  );

  return Object.fromEntries(chromaMetadataEntries);
}

function toChromaMetadataValue(value: JsonValue): ChromaMetadata[string] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      return value;
    }

    if (value.every((item) => typeof item === "number")) {
      return value;
    }

    if (value.every((item) => typeof item === "boolean")) {
      return value;
    }

    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}
