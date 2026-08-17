import type { Chunk, Document, JsonValue } from "@monai-ragsdk/core";
import type {
  RAGAttributes,
  RAGErrorRecord,
  RAGEvent,
  RAGObserver,
  RAGTrace,
  TraceIdSource,
} from "@monai-ragsdk/observability";

import { SimpleChunker } from "../chunkers/simple-chunker.js";
import {
  DEFAULT_BATCH_SIZE,
  defaultMetadataBuilder,
  defaultShouldIndex,
} from "../defaults/index.js";
import { IndexingError } from "../errors/index.js";
import type { ChunkFilter } from "../filters/chunk-filter.js";
import type { MetadataExtractor } from "../metadata/metadata-extractor.js";
import type {
  FingerprintResolver,
  IndexingContext,
  IndexingMode,
  IndexingOptions,
  IndexingResult,
  IndexingStage,
  SourceIdResolver,
} from "../types/index.js";
import type { ChunkTransformer } from "../chunk-transformers/chunk-transformer.js";

type IndexingTraceState = {
  traceId: string;
  traceIdSource: TraceIdSource;
  startedAt: number;
  dataset?: string;
  version?: string;
  tags?: IndexingOptions["trace"] extends infer T
    ? T extends { tags?: infer Tags }
      ? Tags
      : never
    : never;
  events: RAGEvent[];
  errors: RAGErrorRecord[];
};

type StageObservation<T> = {
  startAttributes?: RAGAttributes;
  completeAttributes?: (result: T) => RAGAttributes | undefined;
  failAttributes?: (error: IndexingError) => RAGAttributes | undefined;
};

type IndexingObservation = {
  observer: RAGObserver;
  trace: IndexingTraceState;
};

const defaultObserver: RAGObserver = {};

function normalizeStageName(stage: string): string {
  return stage.replace(/-/g, "_");
}

function buildTraceState(
  options: IndexingOptions,
  startedAt: number,
): IndexingTraceState {
  const providedTraceId = options.trace?.traceId;

  return {
    traceId:
      providedTraceId ?? `indexing:${options.mode ?? "full"}:${startedAt}`,
    traceIdSource: providedTraceId ? "provided" : "generated",
    startedAt,
    dataset: options.trace?.dataset,
    version: options.trace?.version,
    tags: options.trace?.tags,
    events: [],
    errors: [],
  };
}

async function notifyObserver(
  callback: (() => void | Promise<void>) | undefined,
): Promise<void> {
  try {
    await callback?.();
  } catch {
    // Observer failures must never break indexing.
  }
}

async function emitEvent(
  observation: IndexingObservation,
  stage: string,
  action: "start" | "complete" | "fail",
  timestamp: string,
  durationMs?: number,
  attributes?: RAGAttributes,
): Promise<RAGEvent> {
  const normalizedStage = normalizeStageName(stage);
  const event: RAGEvent = {
    traceId: observation.trace.traceId,
    scope: "indexing",
    stage: normalizedStage,
    name: `indexing.${normalizedStage}.${action}`,
    timestamp,
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(attributes ? { attributes } : {}),
  };

  observation.trace.events.push(event);
  await notifyObserver(() => observation.observer.onEvent?.(event));

  return event;
}

async function emitError(
  observation: IndexingObservation,
  stage: string,
  timestamp: string,
  error: IndexingError,
  attributes?: RAGAttributes,
): Promise<RAGErrorRecord> {
  const normalizedStage = normalizeStageName(stage);
  const record: RAGErrorRecord = {
    traceId: observation.trace.traceId,
    scope: "indexing",
    stage: normalizedStage,
    name: `indexing.${normalizedStage}.fail`,
    timestamp,
    error: {
      name: error.name,
      message: error.message,
      ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
    },
    ...(attributes ? { attributes } : {}),
  };

  observation.trace.errors.push(record);
  await notifyObserver(() => observation.observer.onError?.(record));

  return record;
}

async function endTrace(
  observation: IndexingObservation,
  status: "ok" | "error",
): Promise<void> {
  const endedAt = Date.now();
  const payload: RAGTrace = {
    traceId: observation.trace.traceId,
    traceIdSource: observation.trace.traceIdSource,
    scope: "indexing",
    ...(observation.trace.dataset
      ? { dataset: observation.trace.dataset }
      : {}),
    ...(observation.trace.version
      ? { version: observation.trace.version }
      : {}),
    ...(observation.trace.tags ? { tags: observation.trace.tags } : {}),
    startedAt: new Date(observation.trace.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs: endedAt - observation.trace.startedAt,
    status,
    events: [...observation.trace.events],
    ...(observation.trace.errors.length > 0
      ? { errors: [...observation.trace.errors] }
      : {}),
  };

  await notifyObserver(() => observation.observer.onTraceEnd?.(payload));
}

export async function runIndexing(
  options: IndexingOptions,
): Promise<IndexingResult> {
  const startedAt = Date.now();
  const observation: IndexingObservation = {
    observer: options.observer ?? defaultObserver,
    trace: buildTraceState(options, startedAt),
  };
  const loader = options.loader;
  const chunker = options.chunker ?? new SimpleChunker();
  const shouldIndex = options.shouldIndex ?? defaultShouldIndex;
  const metadataBuilder = options.metadataBuilder ?? defaultMetadataBuilder;
  const chunkTransformers = options.chunkTransformers ?? [];
  const chunkFilters = options.chunkFilters ?? [];
  const metadataExtractors = options.metadataExtractors ?? [];
  const transformers = options.transformers ?? [];
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const mode = options.mode ?? "full";
  const sourceIdResolver = options.sourceIdResolver;
  const fingerprintResolver = options.fingerprintResolver;

  await emitEvent(
    observation,
    "run",
    "start",
    new Date().toISOString(),
    undefined,
    {
      mode,
      ...(options.trace?.dataset ? { dataset: options.trace.dataset } : {}),
      ...(options.trace?.version ? { version: options.trace.version } : {}),
    },
  );

  try {
    if (batchSize <= 0) {
      throw new Error("batchSize must be greater than 0");
    }

    const documents = await runStage(
      "load",
      () => loader.load(),
      { mode },
      observation,
      {
        startAttributes: {
          mode,
        },
        completeAttributes: (loadedDocuments) => ({
          mode,
          documentCount: loadedDocuments.length,
        }),
      },
    );

    const result: IndexingResult = {
      documentsTotal: documents.length,
      documentsIndexed: 0,
      chunksTotal: 0,
      vectorsTotal: 0,
      skippedDocuments: 0,
      failedDocuments: 0,
    };

    for (const rawDocument of documents) {
      try {
        let document = rawDocument;
        let documentContext: Omit<IndexingContext, "stage"> = {
          documentId: rawDocument.id,
          mode,
        };

        for (const transformer of transformers) {
          document = await runStage(
            "transform",
            () => transformer.transform(document),
            documentContext,
            observation,
            {
              startAttributes: {
                documentId: documentContext.documentId ?? "unknown",
              },
            },
          );
        }

        documentContext = {
          ...documentContext,
          sourceId: await resolveSourceId(document, sourceIdResolver),
          fingerprint: await resolveFingerprint(document, fingerprintResolver),
        };

        const canIndex = await runStage(
          "filter",
          () => shouldIndex(document),
          documentContext,
          observation,
          {
            startAttributes: {
              documentId: documentContext.documentId ?? "unknown",
            },
            completeAttributes: (shouldKeep) => ({
              documentId: documentContext.documentId ?? "unknown",
              kept: shouldKeep,
            }),
          },
        );

        if (!canIndex) {
          result.skippedDocuments += 1;
          continue;
        }

        const chunks = await runStage(
          "chunk",
          () => chunker.chunk(document),
          documentContext,
          observation,
          {
            startAttributes: {
              documentId: documentContext.documentId ?? "unknown",
            },
            completeAttributes: (createdChunks) => ({
              documentId: documentContext.documentId ?? "unknown",
              chunkCount: createdChunks.length,
            }),
          },
        );
        const processedChunks = await processChunks(
          chunks,
          document,
          mode,
          chunkTransformers,
          documentContext,
          metadataBuilder,
          metadataExtractors,
          chunkFilters,
          observation,
        );

        result.chunksTotal += processedChunks.length;

        for (const chunkBatch of splitIntoBatches(processedChunks, batchSize)) {
          const vectors = await runStage(
            "embed",
            () => options.embedder.embed(chunkBatch),
            {
              ...documentContext,
              chunkId: chunkBatch[0]?.id,
            },
            observation,
            {
              startAttributes: {
                documentId: documentContext.documentId ?? "unknown",
                chunkCount: chunkBatch.length,
              },
              completeAttributes: (embeddedVectors) => ({
                documentId: documentContext.documentId ?? "unknown",
                vectorCount: embeddedVectors.length,
                chunkCount: chunkBatch.length,
              }),
            },
          );

          await runStage(
            "store",
            () =>
              options.store.upsert(vectors, {
                documentId: documentContext.documentId,
                chunkIds: chunkBatch.map((chunk) => chunk.id),
                mode: documentContext.mode,
                sourceId: documentContext.sourceId,
                fingerprint: documentContext.fingerprint,
              }),
            {
              ...documentContext,
              chunkId: chunkBatch[0]?.id,
            },
            observation,
            {
              startAttributes: {
                documentId: documentContext.documentId ?? "unknown",
                vectorCount: vectors.length,
              },
              completeAttributes: () => ({
                documentId: documentContext.documentId ?? "unknown",
                vectorCount: vectors.length,
                upserted: vectors.length,
              }),
            },
          );
          result.vectorsTotal += vectors.length;
        }

        result.documentsIndexed += 1;
      } catch (error) {
        result.failedDocuments += 1;
        const indexingError = toIndexingError(error, {
          documentId: rawDocument.id,
          mode,
        });

        if (options.onError) {
          await options.onError(indexingError, {
            stage: indexingError.stage,
            documentId: indexingError.context?.documentId ?? rawDocument.id,
            chunkId: indexingError.context?.chunkId,
            mode: indexingError.context?.mode ?? mode,
            sourceId: indexingError.context?.sourceId,
            fingerprint: indexingError.context?.fingerprint,
          });
          continue;
        }

        throw indexingError;
      }
    }

    await emitEvent(
      observation,
      "run",
      "complete",
      new Date().toISOString(),
      Date.now() - startedAt,
      {
        documentsTotal: result.documentsTotal,
        documentsIndexed: result.documentsIndexed,
        skippedDocuments: result.skippedDocuments,
        failedDocuments: result.failedDocuments,
        chunksTotal: result.chunksTotal,
        vectorsTotal: result.vectorsTotal,
      },
    );
    await endTrace(observation, "ok");

    return result;
  } catch (error) {
    const indexingError = toIndexingError(error, { mode });
    const timestamp = new Date().toISOString();

    await emitEvent(
      observation,
      "run",
      "fail",
      timestamp,
      Date.now() - startedAt,
      {
        stage: normalizeStageName(indexingError.stage),
        errorName: indexingError.name,
        errorMessage: indexingError.message,
      },
    );
    await emitError(observation, "run", timestamp, indexingError, {
      ...(indexingError.context?.documentId
        ? { documentId: indexingError.context.documentId }
        : {}),
    });
    await endTrace(observation, "error");

    throw indexingError;
  }
}

async function processChunks(
  chunks: Chunk[],
  document: Document,
  mode: IndexingMode,
  chunkTransformers: ChunkTransformer[],
  documentContext: Omit<IndexingContext, "stage">,
  metadataBuilder: (
    document: Document,
    chunk: Chunk,
  ) => Record<string, JsonValue> | Promise<Record<string, JsonValue>>,
  metadataExtractors: MetadataExtractor[],
  chunkFilters: ChunkFilter[],
  observation: IndexingObservation,
): Promise<Chunk[]> {
  const processedChunks: Chunk[] = [];

  for (const rawChunk of chunks) {
    let chunk = rawChunk;
    let chunkContext = buildChunkContext(document, chunk, mode);

    for (const transformer of chunkTransformers) {
      chunk = await runStage(
        "transform-chunk",
        () =>
          transformer.transform(chunk, {
            document,
            mode,
            sourceId: documentContext.sourceId,
            fingerprint: documentContext.fingerprint,
          }),
        chunkContext,
        observation,
      );
      chunkContext = buildChunkContext(document, chunk, mode);
      chunkContext = {
        ...chunkContext,
        sourceId: documentContext.sourceId,
        fingerprint: documentContext.fingerprint,
      };
    }

    chunk = await runStage(
      "metadata",
      () => applyMetadata(document, chunk, metadataBuilder),
      chunkContext,
      observation,
    );
    chunkContext = buildChunkContext(document, chunk, mode);
    chunkContext = {
      ...chunkContext,
      sourceId: documentContext.sourceId,
      fingerprint: documentContext.fingerprint,
    };

    if (metadataExtractors.length > 0) {
      chunk = await runStage(
        "extract-metadata",
        () =>
          applyMetadataExtractors(
            document,
            chunk,
            metadataExtractors,
            mode,
            documentContext,
          ),
        chunkContext,
        observation,
      );
      chunkContext = buildChunkContext(document, chunk, mode);
      chunkContext = {
        ...chunkContext,
        sourceId: documentContext.sourceId,
        fingerprint: documentContext.fingerprint,
      };
    }

    chunk = applyReservedMetadata(chunk, documentContext);
    chunkContext = {
      ...chunkContext,
      sourceId: documentContext.sourceId,
      fingerprint: documentContext.fingerprint,
    };

    const shouldKeepChunk = await shouldKeepChunkAfterFilters(
      chunk,
      document,
      mode,
      chunkFilters,
      chunkContext,
      documentContext,
      observation,
    );

    if (shouldKeepChunk) {
      processedChunks.push(chunk);
    }
  }

  return processedChunks;
}

async function applyMetadata(
  document: Document,
  chunk: Chunk,
  metadataBuilder: (
    document: Document,
    chunk: Chunk,
  ) => Record<string, JsonValue> | Promise<Record<string, JsonValue>>,
): Promise<Chunk> {
  const builtMetadata = await metadataBuilder(document, chunk);

  return {
    ...chunk,
    metadata: {
      ...(chunk.metadata ?? {}),
      ...builtMetadata,
    },
  };
}

function applyReservedMetadata(
  chunk: Chunk,
  documentContext: Omit<IndexingContext, "stage">,
): Chunk {
  if (!documentContext.sourceId && !documentContext.fingerprint) {
    return chunk;
  }

  return {
    ...chunk,
    metadata: {
      ...(chunk.metadata ?? {}),
      ...(documentContext.sourceId
        ? { sourceId: documentContext.sourceId }
        : {}),
      ...(documentContext.fingerprint
        ? { fingerprint: documentContext.fingerprint }
        : {}),
    },
  };
}

async function applyMetadataExtractors(
  document: Document,
  chunk: Chunk,
  metadataExtractors: MetadataExtractor[],
  mode: IndexingMode,
  documentContext: Omit<IndexingContext, "stage">,
): Promise<Chunk> {
  const extractedMetadata: Record<string, JsonValue> = {};

  for (const metadataExtractor of metadataExtractors) {
    const partialMetadata = await metadataExtractor.extract(chunk, {
      document,
      mode,
      sourceId: documentContext.sourceId,
      fingerprint: documentContext.fingerprint,
    });

    if (!partialMetadata) {
      continue;
    }

    Object.assign(extractedMetadata, partialMetadata);
  }

  if (Object.keys(extractedMetadata).length === 0) {
    return chunk;
  }

  return {
    ...chunk,
    metadata: {
      ...(chunk.metadata ?? {}),
      ...extractedMetadata,
    },
  };
}

async function shouldKeepChunkAfterFilters(
  chunk: Chunk,
  document: Document,
  mode: IndexingMode,
  chunkFilters: ChunkFilter[],
  chunkContext: Omit<IndexingContext, "stage">,
  documentContext: Omit<IndexingContext, "stage">,
  observation: IndexingObservation,
): Promise<boolean> {
  for (const chunkFilter of chunkFilters) {
    const shouldKeep = await runStage(
      "filter-chunk",
      () =>
        chunkFilter.shouldKeep(chunk, {
          document,
          mode,
          sourceId: documentContext.sourceId,
          fingerprint: documentContext.fingerprint,
        }),
      chunkContext,
      observation,
    );

    if (!shouldKeep) {
      return false;
    }
  }

  return true;
}

function buildChunkContext(
  document: Document,
  chunk: Chunk,
  mode: IndexingMode,
): Omit<IndexingContext, "stage"> {
  return {
    documentId: document.id,
    chunkId: chunk.id,
    mode,
  };
}

function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  if (items.length === 0) {
    return [];
  }

  const batches: T[][] = [];

  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize));
  }

  return batches;
}

async function runStage<T>(
  stage: IndexingStage,
  run: () => Promise<T> | T,
  context: Omit<IndexingContext, "stage"> = {},
  observation?: IndexingObservation,
  stageObservation?: StageObservation<T>,
): Promise<T> {
  const timestamp = new Date().toISOString();
  const startedAt = Date.now();

  if (observation) {
    await emitEvent(
      observation,
      stage,
      "start",
      timestamp,
      undefined,
      stageObservation?.startAttributes,
    );
  }

  try {
    const result = await run();

    if (observation) {
      await emitEvent(
        observation,
        stage,
        "complete",
        new Date().toISOString(),
        Date.now() - startedAt,
        stageObservation?.completeAttributes?.(result),
      );
    }

    return result;
  } catch (error) {
    const indexingError = toIndexingError(error, context, stage);

    if (observation) {
      const failTimestamp = new Date().toISOString();
      await emitEvent(
        observation,
        stage,
        "fail",
        failTimestamp,
        Date.now() - startedAt,
        stageObservation?.failAttributes?.(indexingError),
      );
      await emitError(observation, stage, failTimestamp, indexingError, {
        ...(context.documentId ? { documentId: context.documentId } : {}),
        ...(context.chunkId ? { chunkId: context.chunkId } : {}),
        ...(context.sourceId ? { sourceId: context.sourceId } : {}),
        ...(context.fingerprint ? { fingerprint: context.fingerprint } : {}),
      });
    }

    throw indexingError;
  }
}

function toIndexingError(
  error: unknown,
  context: Omit<IndexingContext, "stage"> = {},
  stageOverride?: IndexingStage,
): IndexingError {
  if (error instanceof IndexingError) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : "Unknown indexing error";
  const contextSuffix = formatContextSuffix(context);

  return new IndexingError(
    contextSuffix.length > 0 ? `${message} (${contextSuffix})` : message,
    stageOverride ?? "store",
    {
      cause: error instanceof Error ? error : undefined,
      context,
    },
  );
}

function formatContextSuffix(context: Omit<IndexingContext, "stage">): string {
  const contextParts: string[] = [];

  if (context.documentId) {
    contextParts.push(`documentId: ${context.documentId}`);
  }

  if (context.chunkId) {
    contextParts.push(`chunkId: ${context.chunkId}`);
  }

  if (context.sourceId) {
    contextParts.push(`sourceId: ${context.sourceId}`);
  }

  if (context.fingerprint) {
    contextParts.push(`fingerprint: ${context.fingerprint}`);
  }

  return contextParts.join(", ");
}

async function resolveSourceId(
  document: Document,
  sourceIdResolver: SourceIdResolver | undefined,
): Promise<string | undefined> {
  if (sourceIdResolver) {
    return sourceIdResolver(document);
  }

  const sourceId = document.metadata?.sourceId;

  return typeof sourceId === "string" && sourceId.length > 0
    ? sourceId
    : undefined;
}

async function resolveFingerprint(
  document: Document,
  fingerprintResolver: FingerprintResolver | undefined,
): Promise<string | undefined> {
  if (fingerprintResolver) {
    return fingerprintResolver(document);
  }

  const fingerprint = document.metadata?.fingerprint;

  return typeof fingerprint === "string" && fingerprint.length > 0
    ? fingerprint
    : undefined;
}
