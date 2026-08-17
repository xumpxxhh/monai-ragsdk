import { z } from "zod";

import { JsonObjectSchema } from "./json.js";

export const DocumentSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: JsonObjectSchema.optional(),
});
