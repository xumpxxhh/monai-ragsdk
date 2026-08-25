import type {
  GenerationChunksEmptyReason,
  RuntimeGeneratorInput,
} from '../../types/runtime-generator-input.js';

/** 无检索依据时的产品策略：明确拒答或仍允许用模型知识。 */
export type NoGroundingPolicy = 'explicit' | 'generalize';

export type GroundingPolicyAction =
  | { kind: 'proceed' }
  | {
      kind: 'refuse';
      answer: string;
      reason: Exclude<GenerationChunksEmptyReason, 'skipped'>;
    }
  | {
      kind: 'generalize';
      promptContext: string;
      reason: GenerationChunksEmptyReason;
    };

export type GroundingPolicyMessages = Partial<
  Record<Exclude<GenerationChunksEmptyReason, 'skipped'>, string>
>;

const DEFAULT_REFUSAL_MESSAGES: Record<Exclude<GenerationChunksEmptyReason, 'skipped'>, string> = {
  'no-hits': '知识库中未找到与您问题相关的内容，无法据此回答。',
  filtered: '检索到的内容与问题相关性不足，无法据此回答。',
};

/**
 * 按 policy 与 grounding 成因决定：透传、模板拒答、或注入泛化 prompt。
 * skipped 始终走 generalize：routing 主动跳过就是为了用模型知识，不能被 explicit 挡掉。
 */
export function resolveGroundingPolicyAction(
  input: RuntimeGeneratorInput,
  policy: NoGroundingPolicy,
  messages?: GroundingPolicyMessages,
): GroundingPolicyAction {
  if (input.chunks.length > 0 || !input.grounding) {
    return { kind: 'proceed' };
  }

  const reason = input.grounding.chunksEmptyReason;
  const query = input.request.effectiveQuery.query;

  // skip 的产品意图是「不检索、用模型知识」；对 skip 做模板拒答会抵消 routing 语义
  if (reason === 'skipped') {
    return {
      kind: 'generalize',
      reason,
      promptContext: ['以下问题未检索知识库，请直接基于你的知识回答：', query].join('\n'),
    };
  }

  if (policy === 'explicit') {
    return {
      kind: 'refuse',
      reason,
      answer: messages?.[reason] ?? DEFAULT_REFUSAL_MESSAGES[reason],
    };
  }

  return {
    kind: 'generalize',
    reason,
    promptContext: [
      '知识库未提供有效依据，请基于你的知识回答，并在答案中说明这不是来自知识库：',
      query,
    ].join('\n'),
  };
}
