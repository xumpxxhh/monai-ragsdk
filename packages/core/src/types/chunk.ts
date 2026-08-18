import { z } from 'zod';

import { ChunkSchema } from '../spec/chunk.js';

export type Chunk = z.infer<typeof ChunkSchema>;
