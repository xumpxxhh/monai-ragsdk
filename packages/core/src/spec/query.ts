import { z } from 'zod';

import { JsonObjectSchema } from './json.js';

/** 一次检索/生成的输入记录；metadata 留给路由、过滤意图等回放上下文，不当查询正文。 */
export const QuerySchema = z.object({
  query: z.string().min(1),
  metadata: JsonObjectSchema.optional(),
});
