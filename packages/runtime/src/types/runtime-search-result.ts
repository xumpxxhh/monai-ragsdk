import type { RuntimeResult } from './runtime-result.js';

/**
 * 一次 retrieve-only search 的对外结果。
 *
 * 与 `RuntimeResult` 对齐检索侧审计具名字段，但不含 generation 产物。
 * `search()` 停在 post-retrieval，因此没有 answer，也不写 streamed / generation 元数据。
 */
export type RuntimeSearchResult = Omit<
  RuntimeResult,
  'answer' | 'streamed' | 'generationModel' | 'generationMetadata'
>;
