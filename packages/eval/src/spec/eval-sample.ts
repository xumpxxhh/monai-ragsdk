import { z } from 'zod';

/** 单条评测样本；标注在 source 级，避免 chunk 重切分导致 golden 失效。 */
export const EvalSampleSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  relevantSourceIds: z.array(z.string().min(1)).min(1),
  irrelevantSourceIds: z.array(z.string().min(1)).optional(),
  /** 期望系统拒答；缺省则拒答维度不评分。 */
  expectedRefusal: z.boolean().optional(),
  /** 可选参考答案，仅供生成 judge 对照，不参与检索指标。 */
  referenceAnswer: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  note: z.string().optional(),
});
