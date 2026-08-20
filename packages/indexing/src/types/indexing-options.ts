import type { Chunk, Document, JsonValue } from '@monai-ragsdk/core';
import type { RAGObserver, RAGTags } from '@monai-ragsdk/observability';

import type { Chunker } from '../stages/chunk/chunker.js';
import type { Embedder } from '../stages/embed/embedder.js';
import type { ChunkFilter } from '../stages/filter/chunk-filter.js';
import type { Loader } from '../stages/load/loader.js';
import type { MetadataExtractor } from '../stages/enrich/metadata-extractor.js';
import type { VectorStore } from '../stages/store/vector-store.js';
import type { IndexingContext } from './indexing-context.js';
import type { DocumentTransformer } from '../stages/document/document-transformer.js';
import type { ChunkTransformer } from '../stages/chunk/chunk-transformer.js';
import type { IndexingMode } from './indexing-context.js';

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

export type OnIndexingError = (error: Error, context: IndexingContext) => void | Promise<void>;

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
