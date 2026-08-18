import type { RuntimeStrategyModel } from "../../../types/index.js";

export type QueryStrategyErrorMode = "passthrough" | "throw";

export type LlmQueryStrategyOptions = {
  model: RuntimeStrategyModel;
  system?: string;
  /**
   * LLM 调用失败或输出无法解析时：passthrough 保持原 request，避免检索被策略拖死；
   * throw 则把错误交给 runtime 包装为 pre-retrieval 失败。
   */
  onError?: QueryStrategyErrorMode;
};
