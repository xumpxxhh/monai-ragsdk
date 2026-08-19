import type { GenerationGrounding } from '../../types/runtime-generator-input.js';

/**
 * 由 retrieval 条数与最终 chunks 推断空依据成因。
 * skip 必须单独声明：主动不检索也会得到 0 条 candidates，不能当成库里没命中。
 */
export function resolveGenerationGrounding(input: {
  retrievedCount: number;
  chunkCount: number;
  retrievalSkipped?: boolean;
}): GenerationGrounding | undefined {
  if (input.chunkCount > 0) {
    return undefined;
  }

  if (input.retrievalSkipped) {
    return { chunksEmptyReason: 'skipped' };
  }

  if (input.retrievedCount === 0) {
    return { chunksEmptyReason: 'no-hits' };
  }

  return { chunksEmptyReason: 'filtered' };
}
