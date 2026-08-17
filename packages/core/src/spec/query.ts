import { z } from "zod";

export const QuerySchema = z.object({
  query: z.string().min(1),
});
