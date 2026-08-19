export type RetrievalBudget = {
  maxCandidates?: number;
  /**
   * 检索条数的权威字段。adapter（如 pgvector）与 post-retrieval budget-trim 读这个，
   * 不读 `RetrievalRequest.topK`。
   */
  maxChunks?: number;
  maxPromptChars?: number;
};
