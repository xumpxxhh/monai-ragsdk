import { z } from 'zod';

const UnitScoreSchema = z.number().min(0).max(1);

/** 送入生成 judge 的单条上下文；text 为入 prompt 的正文。 */
export const GenerationJudgeContextSchema = z.object({
  sourceId: z.string().min(1).optional(),
  text: z.string(),
});

/**
 * 生成 judge 输入：中性观测 + golden 标注。
 * eval 不跑 pipeline；由 apps mapper 从 RuntimeResult 填入。
 */
export const GenerationJudgeInputSchema = z.object({
  sampleId: z.string().min(1),
  query: z.string().min(1),
  answer: z.string(),
  contexts: z.array(GenerationJudgeContextSchema),
  /** 系统是否已拒答（如 groundingRefusal）。 */
  refused: z.boolean(),
  expectedRefusal: z.boolean().optional(),
  referenceAnswer: z.string().min(1).optional(),
});

/**
 * LLM judge 必须返回的 JSON。拒答对错由纯函数计算，不交给模型。
 * 允许被 markdown 围栏包裹；解析见 parseGenerationJudgeLlmOutput。
 */
export const GenerationJudgeLlmOutputSchema = z.object({
  faithfulness: UnitScoreSchema,
  relevance: UnitScoreSchema,
  rationale: z.string().optional(),
});

/** 单样本生成评分；维度为 null 表示本维不可评，聚合时从该维分母剔除。 */
export const GenerationJudgeScoreSchema = z.object({
  sampleId: z.string().min(1),
  faithfulness: UnitScoreSchema.nullable(),
  relevance: UnitScoreSchema.nullable(),
  refusalCorrectness: UnitScoreSchema.nullable(),
  /** 三维均为 null 时为 true；聚合分母剔除。 */
  unscorable: z.boolean(),
  rationale: z.string().optional(),
  parseError: z.string().optional(),
});
