import type { Chunk, JsonValue } from "@monai-ragsdk/core";
import type {
  ChunkTransformContext,
  ChunkTransformer,
} from "@monai-ragsdk/indexing";

import { normalizeJsonObject } from "../../shared/json.js";

export type LangChainHeaderAwareChunkTransformerOptions = {
  metadataKey?: string;
  metadataFields?: string[];
  includeInContent?: boolean;
  contentPrefix?: string;
  separator?: string;
};

const DEFAULT_METADATA_FIELDS = [
  "Header 1",
  "Header 2",
  "Header 3",
  "Header 4",
  "Header 5",
  "Header 6",
  "header1",
  "header2",
  "header3",
  "header4",
  "header5",
  "header6",
];

export class LangChainHeaderAwareChunkTransformer implements ChunkTransformer {
  readonly #metadataKey: string;
  readonly #metadataFields: string[];
  readonly #includeInContent: boolean;
  readonly #contentPrefix: string;
  readonly #separator: string;

  constructor(options: LangChainHeaderAwareChunkTransformerOptions = {}) {
    this.#metadataKey = options.metadataKey ?? "headerPath";
    this.#metadataFields = options.metadataFields ?? DEFAULT_METADATA_FIELDS;
    this.#includeInContent = options.includeInContent ?? true;
    this.#contentPrefix = options.contentPrefix ?? "Context:";
    this.#separator = options.separator ?? " > ";
  }

  async transform(
    chunk: Chunk,
    context: ChunkTransformContext,
  ): Promise<Chunk> {
    const headerPath = this.#resolveHeaderPath(chunk, context);

    if (headerPath.length === 0) {
      return chunk;
    }

    const metadata: Record<string, JsonValue> = {
      ...(chunk.metadata ?? {}),
      [this.#metadataKey]: headerPath,
    };

    const content = this.#includeInContent
      ? `${this.#contentPrefix} ${headerPath.join(this.#separator)}\n\n${chunk.content}`
      : chunk.content;

    return {
      ...chunk,
      content,
      metadata,
    };
  }

  #resolveHeaderPath(chunk: Chunk, context: ChunkTransformContext): string[] {
    const normalizedChunkMetadata = normalizeJsonObject(
      (chunk.metadata ?? {}) as Record<string, unknown>,
    );
    const normalizedDocumentMetadata = normalizeJsonObject(
      (context.document.metadata ?? {}) as Record<string, unknown>,
    );
    const explicitPath = this.#pickPathFromMetadata(normalizedChunkMetadata);

    if (explicitPath.length > 0) {
      return explicitPath;
    }

    return this.#pickPathFromMetadata(normalizedDocumentMetadata);
  }

  #pickPathFromMetadata(
    metadata: Record<string, JsonValue> | undefined,
  ): string[] {
    if (!metadata) {
      return [];
    }

    const explicitPath = metadata[this.#metadataKey];

    if (Array.isArray(explicitPath)) {
      return explicitPath.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      );
    }

    return this.#metadataFields.flatMap((field) => {
      const value = metadata[field];
      return typeof value === "string" && value.trim().length > 0
        ? [value.trim()]
        : [];
    });
  }
}
