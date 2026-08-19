export type RetrievalRerankPolicy = {
  /** 成功重排后由策略写入，供 debug / audit；失败透传不得写。 */
  strategy?: string;
  /**
   * 预留观测字段。内核不读取、不按它截断候选；真正条数仍是 `budget.maxChunks`。
   */
  topK?: number;
  /** 行为字段：score-threshold 可把它当作阈值意图。 */
  minScore?: number;
};
