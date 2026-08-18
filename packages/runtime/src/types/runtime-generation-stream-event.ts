import type { RuntimeGenerationResult } from "./runtime-generation-result.js";

/**
 * generator 流式事件：delta 是增量文本，complete 携带与 generate() 同构的最终结果。
 * 只产出 complete、没有 delta 时，runtime 会把完整 answer 补成一次 delta，方便调用方统一消费。
 */
export type RuntimeGenerationStreamEvent =
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "complete";
      result: RuntimeGenerationResult;
    };
