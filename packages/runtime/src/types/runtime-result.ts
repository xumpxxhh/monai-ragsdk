import type { RAGResponse } from "@monai-ragsdk/core";

import type { RuntimeDebugInfo } from "./runtime-debug-info.js";

/**
 * 一次 run / runStream 的对外结果。
 * 主体是 core 审计快照；debug 仍是 runtime 过程对象，不塞进 RAGResponse.debug 袋。
 */
export type RuntimeResult = Omit<RAGResponse, "debug"> & {
  debug?: RuntimeDebugInfo;
};
