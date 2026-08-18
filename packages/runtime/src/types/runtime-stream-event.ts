import type { RuntimeResult } from "./runtime-result.js";

/**
 * runtime.runStream() 对外事件。
 * 检索三阶段仍一次性完成，只在 generation 向外推 delta；result 始终是最后一条。
 */
export type RuntimeStreamEvent =
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "result";
      result: RuntimeResult;
    };
