import type { z } from 'zod';

import type { EvalDatasetSchema } from '../spec/eval-dataset.js';

export type EvalDataset = z.infer<typeof EvalDatasetSchema>;
