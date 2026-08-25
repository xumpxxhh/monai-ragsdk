import { EvalDatasetSchema } from '../spec/eval-dataset.js';

/** 解析并校验 golden 数据集；不读文件，调用方自行 load JSON。 */
export function parseEvalDataset(input: unknown) {
  return EvalDatasetSchema.parse(input);
}

/** 安全解析；失败时返回 ZodError 而非抛错。 */
export function safeParseEvalDataset(input: unknown) {
  return EvalDatasetSchema.safeParse(input);
}
