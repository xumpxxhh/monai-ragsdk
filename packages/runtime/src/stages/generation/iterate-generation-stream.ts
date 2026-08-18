import type { RuntimeGenerator } from "./runtime-generator.js";
import type { RuntimeContext } from "../../types/runtime-context.js";
import type { RuntimeGenerationStreamEvent } from "../../types/runtime-generation-stream-event.js";
import type { RuntimeGeneratorInput } from "../../types/runtime-generator-input.js";

/**
 * 统一 generator 流式入口：有 generateStream 就走真流式，否则一次 generate() 后当成单段 delta。
 * 没有流式实现的 LangChain / 测试 generator 仍能被 runStream() 消费。
 */
export async function* iterateRuntimeGeneratorStream(
  generator: RuntimeGenerator,
  input: RuntimeGeneratorInput,
  context: RuntimeContext,
): AsyncIterable<RuntimeGenerationStreamEvent> {
  if (generator.generateStream) {
    yield* generator.generateStream(input, context);
    return;
  }

  const result = await generator.generate(input, context);

  if (result.answer) {
    yield {
      type: "delta",
      text: result.answer,
    };
  }

  yield {
    type: "complete",
    result,
  };
}
