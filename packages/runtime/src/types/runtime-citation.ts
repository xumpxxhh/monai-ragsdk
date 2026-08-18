/**
 * 一次查询的 grounding 引用。
 * 按进入 generation 的 chunks 顺序编号；不解析答案里的 [1]/[2]，也不要求 generator 另产出引用。
 */
export type RuntimeCitation = {
  /** 1-based，与送入 generation 的 chunk 顺序一致，便于调用方展示 [1]。 */
  index: number;
  chunkId: string;
  sourceId?: string;
  score?: number;
  title?: string;
  hierarchyPath?: string;
};
