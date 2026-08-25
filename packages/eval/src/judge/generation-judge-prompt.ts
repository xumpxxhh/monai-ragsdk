import type { GenerationJudgeInput } from '../types/generation-judge.js';

/**
 * 生成 judge 的系统提示。要求只输出 JSON，避免把说明文字掺进分数。
 * 拒答对错不在此协议内：由 scoreRefusalCorrectness 按标注计算。
 */
export const GENERATION_JUDGE_SYSTEM_PROMPT = [
  '你是 RAG 生成质量评审员。只根据提供的提问、答案与检索上下文打分，不要引入外部知识。',
  '必须只输出一个 JSON 对象，不要 markdown 围栏，不要额外说明。',
  '字段：',
  '- faithfulness: 0 到 1。答案中的事实主张有多少被「检索上下文」支持；编造、过度推断应压低分数。',
  '- relevance: 0 到 1。答案是否直接回应提问。切题的拒答可以给高分。',
  '- rationale: 可选，一两句中文理由。',
].join('\n');

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}…`;
}

/**
 * 把 GenerationJudgeInput 填进 user prompt。
 * 上下文过长时截断单条，避免把整段语料塞进 judge 调用。
 */
export function buildGenerationJudgeUserPrompt(
  input: GenerationJudgeInput,
  options: { maxContextChars?: number } = {},
): string {
  const maxContextChars = options.maxContextChars ?? 1200;
  const contextBlock =
    input.contexts.length === 0
      ? '（无检索上下文）'
      : input.contexts
          .map((context, index) => {
            const source = context.sourceId ? ` sourceId=${context.sourceId}` : '';
            return `[${index + 1}${source}]\n${truncate(context.text, maxContextChars)}`;
          })
          .join('\n\n');

  const lines = [
    `sampleId: ${input.sampleId}`,
    `提问: ${input.query}`,
    `系统是否拒答: ${input.refused ? '是' : '否'}`,
    `答案:\n${input.answer.trim().length > 0 ? input.answer : '（空）'}`,
    `检索上下文:\n${contextBlock}`,
  ];

  if (input.referenceAnswer) {
    lines.push(`参考答案:\n${input.referenceAnswer}`);
  }

  return lines.join('\n\n');
}

/** 供 apps 注入 LLM 的成对提示。 */
export function buildGenerationJudgePrompt(input: GenerationJudgeInput): {
  system: string;
  prompt: string;
} {
  return {
    system: GENERATION_JUDGE_SYSTEM_PROMPT,
    prompt: buildGenerationJudgeUserPrompt(input),
  };
}
