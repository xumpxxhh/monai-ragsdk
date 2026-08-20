import type { Document } from '@monai-ragsdk/core';

/** 文档级 filter 默认实现：空内容不进索引流水线。 */
export function defaultShouldIndex(document: Document): boolean {
  return document.content.trim().length > 0;
}
