import type { Chunk, JsonValue } from "@monai-ragsdk/core";

import type {
  MetadataExtractionContext,
  MetadataExtractor,
} from "./metadata-extractor.js";

export type BasicMetadataExtractorOptions = {
  includeIndexingMode?: boolean;
  includeIncrementalMetadata?: boolean;
  includeHierarchyMetadata?: boolean;
};

export class BasicMetadataExtractor implements MetadataExtractor {
  readonly #includeIndexingMode: boolean;
  readonly #includeIncrementalMetadata: boolean;
  readonly #includeHierarchyMetadata: boolean;

  constructor(options: BasicMetadataExtractorOptions = {}) {
    this.#includeIndexingMode = options.includeIndexingMode ?? true;
    this.#includeIncrementalMetadata =
      options.includeIncrementalMetadata ?? true;
    this.#includeHierarchyMetadata = options.includeHierarchyMetadata ?? true;
  }

  async extract(
    chunk: Chunk,
    context: MetadataExtractionContext,
  ): Promise<Record<string, JsonValue>> {
    const metadata: Record<string, JsonValue> = {
      chunkId: chunk.id,
      chunkLength: chunk.content.length,
      sourceDocumentId: context.document.id,
    };

    if (this.#includeIndexingMode) {
      metadata.indexingMode = context.mode;
    }

    if (this.#includeIncrementalMetadata) {
      if (context.sourceId) {
        metadata.sourceId = context.sourceId;
      }

      if (context.fingerprint) {
        metadata.fingerprint = context.fingerprint;
      }
    }

    const title = context.document.metadata?.title;

    if (typeof title === "string" && title.trim().length > 0) {
      metadata.documentTitle = title;
    }

    if (this.#includeHierarchyMetadata) {
      const hierarchyPath = resolveHierarchyPath(chunk, context.document);

      if (hierarchyPath.length > 0) {
        metadata.hierarchyPath = hierarchyPath;
        metadata.hierarchyDepth = hierarchyPath.length;

        if (hierarchyPath.length > 1) {
          metadata.parentHierarchyPath = hierarchyPath.slice(0, -1);
        }
      }
    }

    return metadata;
  }
}

function resolveHierarchyPath(
  chunk: Chunk,
  document: MetadataExtractionContext["document"],
): string[] {
  const chunkHierarchyPath = readPathMetadata(chunk.metadata?.headerPath);

  if (chunkHierarchyPath.length > 0) {
    return chunkHierarchyPath;
  }

  return readPathMetadata(document.metadata?.headerPath);
}

function readPathMetadata(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (segment): segment is string =>
      typeof segment === "string" && segment.length > 0,
  );
}
