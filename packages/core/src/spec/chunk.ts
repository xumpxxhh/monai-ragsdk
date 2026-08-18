import { z } from "zod";

import { JsonObjectSchema } from "./json.js";

/** chunk id 会被 citations / selectionTrace 引用，空字符串会让审计对账断裂。 */
export const ChunkSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  metadata: JsonObjectSchema.optional(),
});
