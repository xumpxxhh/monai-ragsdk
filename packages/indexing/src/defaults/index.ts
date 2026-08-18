import type { Chunk, Document, JsonValue } from '@monai-ragsdk/core';

export const DEFAULT_CHUNK_SIZE = 500;
export const DEFAULT_CHUNK_OVERLAP = 50;
export const DEFAULT_VECTOR_DIMENSION = 8;
export const DEFAULT_BATCH_SIZE = 50;

export function defaultShouldIndex(document: Document): boolean {
  return document.content.trim().length > 0;
}

export function defaultMetadataBuilder(
  document: Document,
  _chunk: Chunk,
): Record<string, JsonValue> {
  return {
    ...(document.metadata ?? {}),
    documentId: document.id,
  };
}
