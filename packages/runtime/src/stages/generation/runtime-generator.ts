import type { RuntimeContext } from "../../types/runtime-context.js";
import type { RuntimeGenerationResult } from "../../types/runtime-generation-result.js";
import type { RuntimeGenerationStreamEvent } from "../../types/runtime-generation-stream-event.js";
import type { RuntimeGeneratorInput } from "../../types/runtime-generator-input.js";

export interface RuntimeGenerator {
  generate(
    input: RuntimeGeneratorInput,
    context: RuntimeContext,
  ): Promise<RuntimeGenerationResult>;

  /**
   * 可选。缺省时 runtime.runStream() 会调用 generate()，把完整答案当成一次 delta。
   * run() 始终走 generate()，不把流式路径的重试/超时语义套到非流式调用上。
   */
  generateStream?(
    input: RuntimeGeneratorInput,
    context: RuntimeContext,
  ): AsyncIterable<RuntimeGenerationStreamEvent>;
}
