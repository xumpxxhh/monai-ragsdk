import type { z } from 'zod';

import type { EvalSampleSchema } from '../spec/eval-sample.js';

export type EvalSample = z.infer<typeof EvalSampleSchema>;
