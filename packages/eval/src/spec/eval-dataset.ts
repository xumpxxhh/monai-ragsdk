import { z } from 'zod';

import { EvalSampleSchema } from './eval-sample.js';

/** 离线 golden 数据集；sample id 在数据集内必须唯一。 */
export const EvalDatasetSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    samples: z.array(EvalSampleSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();

    for (const sample of value.samples) {
      if (seen.has(sample.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate sample id: ${sample.id}`,
          path: ['samples'],
        });
        return;
      }

      seen.add(sample.id);
    }
  });
