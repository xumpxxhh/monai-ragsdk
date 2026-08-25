import type { RuntimeContext } from '../../types/runtime-context.js';
import type { RuntimeGenerationResult } from '../../types/runtime-generation-result.js';
import type { RuntimeGenerationStreamEvent } from '../../types/runtime-generation-stream-event.js';
import type { RuntimeGeneratorInput } from '../../types/runtime-generator-input.js';

import type { RuntimeGenerator } from './runtime-generator.js';
import {
  type GroundingPolicyMessages,
  type NoGroundingPolicy,
  resolveGroundingPolicyAction,
} from './grounding-policy.js';

export type CreateGroundingPolicyRuntimeGeneratorOptions = {
  policy: NoGroundingPolicy;
  /** 覆盖 no-hits / filtered 的默认中文拒答文案。 */
  messages?: GroundingPolicyMessages;
};

/**
 * 在厂商 generator 外包一层：按 noGroundingPolicy 消费 runtime 写入的 grounding。
 * 拒答走模板短路（不调 inner）；泛化注入 promptContext 后再委托。
 */
export function createGroundingPolicyRuntimeGenerator(
  inner: RuntimeGenerator,
  options: CreateGroundingPolicyRuntimeGeneratorOptions,
): RuntimeGenerator {
  const { policy, messages } = options;

  const buildRefusalResult = (answer: string, reason: string): RuntimeGenerationResult => ({
    answer,
    generationMetadata: {
      groundingRefusal: true,
      chunksEmptyReason: reason,
      noGroundingPolicy: policy,
    },
  });

  /** generalize 时剥掉 grounding，避免内层再把空依据当「无上下文」拼假 prompt。 */
  const toGeneralizeInput = (
    input: RuntimeGeneratorInput,
    promptContext: string,
  ): RuntimeGeneratorInput => {
    const { grounding: _grounding, ...rest } = input;
    return {
      ...rest,
      promptContext,
    };
  };

  return {
    async generate(input, context) {
      const action = resolveGroundingPolicyAction(input, policy, messages);

      if (action.kind === 'refuse') {
        return buildRefusalResult(action.answer, action.reason);
      }

      if (action.kind === 'generalize') {
        return inner.generate(toGeneralizeInput(input, action.promptContext), context);
      }

      return inner.generate(input, context);
    },

    async *generateStream(
      input: RuntimeGeneratorInput,
      context: RuntimeContext,
    ): AsyncIterable<RuntimeGenerationStreamEvent> {
      const action = resolveGroundingPolicyAction(input, policy, messages);

      if (action.kind === 'refuse') {
        const result = buildRefusalResult(action.answer, action.reason);
        yield { type: 'delta', text: action.answer };
        yield { type: 'complete', result };
        return;
      }

      const nextInput =
        action.kind === 'generalize' ? toGeneralizeInput(input, action.promptContext) : input;

      // 内层无 stream 时由 runtime.iterateRuntimeGeneratorStream 回退；此处自实现以免丢拒答 stream
      if (!inner.generateStream) {
        const result = await inner.generate(nextInput, context);
        if (result.answer) {
          yield { type: 'delta', text: result.answer };
        }
        yield { type: 'complete', result };
        return;
      }

      yield* inner.generateStream(nextInput, context);
    },
  };
}
