import type { Chunk, Document, JsonValue } from "@monai-ragsdk/core";
import type { RAGObserver, RAGTags } from "@monai-ragsdk/observability";

import type { Chunker } from "../chunkers/chunker.js";
import type { Embedder } from "../embedders/embedder.js";
import type { ChunkFilter } from "../filters/chunk-filter.js";
import type { Loader } from "../loaders/loader.js";
import type { MetadataExtractor } from "../metadata/metadata-extractor.js";
import type { VectorStore } from "../stores/vector-store.js";
import type { IndexingContext } from "./indexing-context.js";
import type { DocumentTransformer } from "../transformers/document-transformer.js";
import type { ChunkTransformer } from "../chunk-transformers/chunk-transformer.js";
import type { IndexingMode } from "./indexing-context.js";

export type MetadataBuilder = (
  document: Document,
  chunk: Chunk,
) => Record<string, JsonValue> | Promise<Record<string, JsonValue>>;

export type ShouldIndex = (document: Document) => boolean | Promise<boolean>;

export type SourceIdResolver = (
  document: Document,
) => string | undefined | Promise<string | undefined>;

export type FingerprintResolver = (
  document: Document,
) => string | undefined | Promise<string | undefined>;

export type OnIndexingError = (
  error: Error,
  context: IndexingContext,
) => void | Promise<void>;

export type IndexingTraceOptions = {
  traceId?: string;
  dataset?: string;
  version?: string;
  tags?: RAGTags;
};

export type IndexingOptions = {
  loader: Loader;
  chunker?: Chunker;
  embedder: Embedder;
  store: VectorStore;
  transformers?: DocumentTransformer[];
  chunkTransformers?: ChunkTransformer[];
  chunkFilters?: ChunkFilter[];
  metadataExtractors?: MetadataExtractor[];
  shouldIndex?: ShouldIndex;
  metadataBuilder?: MetadataBuilder;
  onError?: OnIndexingError;
  batchSize?: number;
  mode?: IndexingMode;
  sourceIdResolver?: SourceIdResolver;
  fingerprintResolver?: FingerprintResolver;
  observer?: RAGObserver;
  trace?: IndexingTraceOptions;
};
