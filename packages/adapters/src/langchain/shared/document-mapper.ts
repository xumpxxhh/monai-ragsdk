import { Document as LangChainDocument } from "@langchain/core/documents";
import type { Chunk, Document, JsonValue } from "@monai-ragsdk/core";

import { mergeJsonObjects, normalizeJsonObject } from "../../shared/json.js";

export type LangChainDocumentLike = {
  pageContent: string;
  metadata?: Record<string, unknown>;
  id?: string;
};

const createFallbackId = (prefix: string, index: number): string => {
  return `${prefix}-${index}`;
};

export const toRagDocument = (
  document: LangChainDocumentLike,
  index: number,
  idPrefix: string,
): Document => {
  return {
    id: document.id ?? createFallbackId(idPrefix, index),
    content: document.pageContent,
    metadata: normalizeJsonObject(document.metadata),
  };
};

export const toLangChainDocument = (document: Document): LangChainDocument => {
  return new LangChainDocument({
    id: document.id,
    pageContent: document.content,
    metadata: normalizeJsonObject(document.metadata) ?? {},
  });
};

export const toRagChunk = (
  sourceDocument: Document,
  chunkDocument: LangChainDocumentLike,
  chunkIndex: number,
): Chunk => {
  const chunkMetadata = mergeJsonObjects(
    normalizeJsonObject(sourceDocument.metadata),
    normalizeJsonObject(chunkDocument.metadata),
    {
      sourceDocumentId: sourceDocument.id,
      chunkIndex,
    } satisfies Record<string, JsonValue>,
  );

  return {
    id: chunkDocument.id ?? `${sourceDocument.id}#${chunkIndex}`,
    content: chunkDocument.pageContent,
    metadata: chunkMetadata,
  };
};
