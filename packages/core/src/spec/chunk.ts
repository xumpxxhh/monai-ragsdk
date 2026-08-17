import { z } from "zod";

import { JsonObjectSchema } from "./json.js";

export const ChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: JsonObjectSchema.optional(),
});
