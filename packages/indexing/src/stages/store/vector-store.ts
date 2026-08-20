import type { Vector } from '@monai-ragsdk/core';

import type { IndexingMode } from '../../types/indexing-context.js';

export type VectorStoreWriteContext = {
  documentId?: string;
  chunkIds?: string[];
  mode?: IndexingMode;
  sourceId?: string;
  fingerprint?: string;
};

export type VectorStoreDeleteFilter = {
  sourceIds?: string[];
  fingerprints?: string[];
};

export type VectorStoreSourceRecord = {
  sourceId: string;
  fingerprint?: string;
};

export interface VectorStore {
  upsert(vectors: Vector[], context?: VectorStoreWriteContext): Promise<void>;
  deleteByFilter?(filter: VectorStoreDeleteFilter): Promise<void>;
  listSourceRecords?(): Promise<VectorStoreSourceRecord[]>;
  /**
   * 仅当 store 自建了连接池等外部资源时实现。
   * Memory 等进程内实现不必提供；注入的 client 也不应在这里关闭。
   */
  close?(): Promise<void>;
}
