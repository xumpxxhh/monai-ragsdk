import type { Chunk, JsonValue } from "@monai-ragsdk/core";
import type {
  MetadataExtractionContext,
  MetadataExtractor,
} from "@monai-ragsdk/indexing";

import { mergeJsonObjects, normalizeJsonObject } from "../../shared/json.js";

export type LangChainDocumentMetadataExtractorOptions = {
  includeLocation?: boolean;
  headerMetadataFields?: string[];
};

const DEFAULT_HEADER_FIELDS = [
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

export class LangChainDocumentMetadataExtractor implements MetadataExtractor {
  readonly #includeLocation: boolean;
  readonly #headerMetadataFields: string[];

  constructor(options: LangChainDocumentMetadataExtractorOptions = {}) {
    this.#includeLocation = options.includeLocation ?? true;
    this.#headerMetadataFields =
      options.headerMetadataFields ?? DEFAULT_HEADER_FIELDS;
  }

  async extract(
    chunk: Chunk,
    context: MetadataExtractionContext,
  ): Promise<Record<string, JsonValue> | undefined> {
    const documentMetadata = normalizeJsonObject(
      (context.document.metadata ?? {}) as Record<string, unknown>,
    );
    const chunkMetadata = normalizeJsonObject(
      (chunk.metadata ?? {}) as Record<string, unknown>,
    );
    const sourcePath =
      this.#pickString(chunkMetadata, "source") ??
      this.#pickString(documentMetadata, "source");
    const title =
      this.#pickString(chunkMetadata, "title") ??
      this.#pickString(documentMetadata, "title");
    const headerPath =
      this.#pickHeaderPath(chunkMetadata) ??
      this.#pickHeaderPath(documentMetadata);
    const location = this.#includeLocation
      ? (this.#pickObject(chunkMetadata, "loc") ??
        this.#pickObject(documentMetadata, "loc"))
      : undefined;

    return mergeJsonObjects(
      sourcePath ? { sourcePath } : undefined,
      title ? { documentTitle: title } : undefined,
      headerPath ? { headerPath } : undefined,
      location ? { sourceLocation: location } : undefined,
    );
  }

  #pickString(
    metadata: Record<string, JsonValue> | undefined,
    key: string,
  ): string | undefined {
    const value = metadata?.[key];
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  #pickObject(
    metadata: Record<string, JsonValue> | undefined,
    key: string,
  ): Record<string, JsonValue> | undefined {
    const value = metadata?.[key];

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }

    return value;
  }

  #pickHeaderPath(
    metadata: Record<string, JsonValue> | undefined,
  ): string[] | undefined {
    if (!metadata) {
      return undefined;
    }

    const explicitPath = metadata.headerPath;

    if (Array.isArray(explicitPath)) {
      const values = explicitPath.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      );

      if (values.length > 0) {
        return values;
      }
    }

    const values = this.#headerMetadataFields.flatMap((field) => {
      const value = metadata[field];
      return typeof value === "string" && value.trim().length > 0
        ? [value.trim()]
        : [];
    });

    return values.length > 0 ? values : undefined;
  }
}
