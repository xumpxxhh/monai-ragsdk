import { z } from 'zod';

import { QuerySchema } from '../spec/query.js';

export type Query = z.infer<typeof QuerySchema>;
