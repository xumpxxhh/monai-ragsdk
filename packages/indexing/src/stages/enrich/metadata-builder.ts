import type { Chunk, Document, JsonValue } from '@monai-ragsdk/core';

/** 合并文档 metadata 与 chunk 归属字段的默认 builder。 */
export function defaultMetadataBuilder(
  document: Document,
  _chunk: Chunk,
): Record<string, JsonValue> {
  return {
    ...(document.metadata ?? {}),
    documentId: document.id,
  };
}
