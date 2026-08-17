import { z } from "zod";

import { JsonObjectSchema } from "./json.js";

export const VectorSchema = z.object({
  id: z.string(),
  values: z.array(z.number()),
  metadata: JsonObjectSchema.optional(),
});
