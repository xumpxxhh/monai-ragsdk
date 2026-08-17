import { z } from "zod";

import { ChunkSchema } from "./chunk.js";

export const RAGResponseSchema = z.object({
  answer: z.string(),
  chunks: z.array(ChunkSchema),
});
