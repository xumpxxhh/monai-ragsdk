import { z } from 'zod';

import { ChunkSchema } from './chunk.js';
import { JsonObjectSchema } from './json.js';
import { QuerySchema } from './query.js';

/** 审计用有限数字：NaN / Infinity 不能落盘对账。 */
const FiniteNumberSchema = z.number().finite();

/** 正整数预算/条数；与 runtime RetrievalBudget、rerank.topK 对齐。 */
const PositiveIntSchema = z.number().int().positive();

/** 非负整数计数。 */
const NonNegativeIntSchema = z.number().int().nonnegative();

/** Unix 毫秒时间戳；存储与流通用 number，展示层再转 ISO。 */
const EpochMillisSchema = FiniteNumberSchema.int().nonnegative();

/**
 * 答案溯源条目。index 与送入生成的 chunks 同序、从 1 起编；
 * 不解析答案里的 [1]/[2]，由调用方按 chunks 顺序派生。
 * originalContent 仅在压缩改写了正文时填写，chunks[i].content 始终是生成实际看到的文本。
 */
export const RAGCitationSchema = z.object({
  index: z.number().int().min(1),
  chunkId: z.string().min(1),
  sourceId: z.string().min(1).optional(),
  score: FiniteNumberSchema.optional(),
  title: z.string().optional(),
  hierarchyPath: z.string().optional(),
  compressed: z.boolean().optional(),
  originalContent: z.string().optional(),
});

/**
 * 压缩后的选留决策。只用 chunkId 关联，避免把 runtime candidate 整对象提升进 core；
 * reason / stage 用字符串，避免 core 绑定 runtime 枚举。
 * 丢掉的候选不在 chunks 里，sourceId / fingerprint / 压缩前原文必须能从这里还原。
 */
export const RAGSelectionTraceEntrySchema = z.object({
  chunkId: z.string().min(1),
  selected: z.boolean(),
  reason: z.string().min(1),
  stage: z.string().optional(),
  score: FiniteNumberSchema.optional(),
  order: z.number().int().optional(),
  sourceId: z.string().min(1).optional(),
  fingerprint: z.string().min(1).optional(),
  compressed: z.boolean().optional(),
  originalContent: z.string().optional(),
});

/**
 * 按 pipeline 阶段记录实际生效的策略名；值为有序列表，因为同一阶段常串联多件。
 * 不用枚举，避免 core 绑定 runtime 策略件名称。
 */
export const RAGStageStrategiesSchema = z.object({
  preRetrieval: z.array(z.string().min(1)).optional(),
  retrieval: z.array(z.string().min(1)).optional(),
  postRetrieval: z.array(z.string().min(1)).optional(),
  generation: z.array(z.string().min(1)).optional(),
});

/**
 * 检索过滤意图，对齐 runtime RetrievalFilters。
 * metadata 仍为开放袋；具名过滤键不能塞进 JsonObject，否则无法按 source / 层级查询。
 */
export const RAGFiltersSchema = z.object({
  sourceIds: z.array(z.string().min(1)).optional(),
  fingerprints: z.array(z.string().min(1)).optional(),
  hierarchyPaths: z.array(z.string().min(1)).optional(),
  parentHierarchyPaths: z.array(z.string().min(1)).optional(),
  minHierarchyDepth: NonNegativeIntSchema.optional(),
  maxHierarchyDepth: NonNegativeIntSchema.optional(),
  metadata: JsonObjectSchema.optional(),
});

/** 检索/上下文预算意图或实际应用值，对齐 runtime RetrievalBudget。 */
export const RAGBudgetSchema = z.object({
  maxCandidates: PositiveIntSchema.optional(),
  maxChunks: PositiveIntSchema.optional(),
  maxPromptChars: PositiveIntSchema.optional(),
});

/** 重排策略意图，对齐 runtime RetrievalRerankPolicy。 */
export const RAGRerankSchema = z.object({
  strategy: z.string().min(1).optional(),
  topK: PositiveIntSchema.optional(),
  minScore: FiniteNumberSchema.optional(),
});

/**
 * 阶段结果计数。有则四项一起写，便于对照「召回 / 选留 / 丢掉 / 最终进入生成」。
 * finalChunks 必须等于 chunks.length。
 */
export const RAGCountsSchema = z.object({
  retrieved: NonNegativeIntSchema,
  selected: NonNegativeIntSchema,
  dropped: NonNegativeIntSchema,
  finalChunks: NonNegativeIntSchema,
});

/** 各阶段耗时（毫秒），对齐 runtime debug timings；不进 debug 袋。 */
export const RAGTimingsSchema = z.object({
  preRetrieval: FiniteNumberSchema.nonnegative().optional(),
  retrieval: FiniteNumberSchema.nonnegative().optional(),
  postRetrieval: FiniteNumberSchema.nonnegative().optional(),
  generation: FiniteNumberSchema.nonnegative().optional(),
  total: FiniteNumberSchema.nonnegative().optional(),
});

/**
 * 召回清单压缩形态：只留审计/对照用的键，不嵌套整颗 Chunk。
 * 用于区分「没召回」与「召回后被 post-retrieval 丢掉」。
 */
export const RAGRetrievedCandidateSchema = z.object({
  chunkId: z.string().min(1),
  score: FiniteNumberSchema.optional(),
  sourceId: z.string().min(1).optional(),
  strategy: z.string().min(1).optional(),
  route: z.string().min(1).optional(),
});

function refineAuditSnapshot(
  value: {
    chunks: Array<{ id: string }>;
    citations: Array<{ index: number; chunkId: string }>;
    startedAt?: number;
    endedAt?: number;
    droppedChunkIds?: string[];
    counts?: {
      retrieved: number;
      selected: number;
      dropped: number;
      finalChunks: number;
    };
    retrievedCandidates?: Array<{ chunkId: string }>;
  },
  ctx: z.RefinementCtx,
): void {
  // citations 必须与进入生成的 chunks 等长同序，否则 [n] 对不上上下文
  if (value.citations.length !== value.chunks.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['citations'],
      message: 'citations must be the same length as chunks',
    });
  } else {
    for (let index = 0; index < value.chunks.length; index += 1) {
      const citation = value.citations[index];
      const chunk = value.chunks[index];
      if (!citation || !chunk) {
        continue;
      }

      if (citation.index !== index + 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['citations', index, 'index'],
          message: 'citation index must be 1-based and match chunk order',
        });
      }

      if (citation.chunkId !== chunk.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['citations', index, 'chunkId'],
          message: 'citation chunkId must match chunks[i].id',
        });
      }
    }
  }

  if (value.startedAt !== undefined && value.endedAt !== undefined) {
    if (value.endedAt < value.startedAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'endedAt must be greater than or equal to startedAt',
      });
    }
  }

  if (value.counts && value.counts.finalChunks !== value.chunks.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['counts', 'finalChunks'],
      message: 'counts.finalChunks must equal chunks.length',
    });
  }

  if (
    value.counts &&
    value.droppedChunkIds &&
    value.counts.dropped !== value.droppedChunkIds.length
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['counts', 'dropped'],
      message: 'counts.dropped must equal droppedChunkIds.length',
    });
  }

  if (
    value.counts &&
    value.retrievedCandidates &&
    value.counts.retrieved !== value.retrievedCandidates.length
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['counts', 'retrieved'],
      message: 'counts.retrieved must equal retrievedCandidates.length',
    });
  }
}

/**
 * 一次查询结束后的审计快照：可 Zod 校验、可 JSON 落盘。
 * 必填字段支撑溯源与原/有效查询对照；其余字段有则写入，供决策留痕与回放。
 * debug 只作非契约溢出袋，审计关键信息必须走具名字段。
 */
export const RAGResponseSchema = z
  .object({
    answer: z.string(),
    chunks: z.array(ChunkSchema),
    citations: z.array(RAGCitationSchema),
    originalQuery: QuerySchema,
    effectiveQuery: QuerySchema,
    requestId: z.string().min(1).optional(),
    traceId: z.string().min(1).optional(),
    startedAt: EpochMillisSchema.optional(),
    endedAt: EpochMillisSchema.optional(),
    subQueries: z.array(QuerySchema).optional(),
    rewriteReason: z.string().min(1).optional(),
    route: z.string().min(1).optional(),
    routeReason: z.string().min(1).optional(),
    strategies: RAGStageStrategiesSchema.optional(),
    topK: PositiveIntSchema.optional(),
    filters: RAGFiltersSchema.optional(),
    budget: RAGBudgetSchema.optional(),
    appliedBudget: RAGBudgetSchema.optional(),
    rerank: RAGRerankSchema.optional(),
    indexingMode: z.enum(['full', 'incremental']).optional(),
    droppedChunkIds: z.array(z.string().min(1)).optional(),
    retrievedCandidates: z.array(RAGRetrievedCandidateSchema).optional(),
    selectionTrace: z.array(RAGSelectionTraceEntrySchema).optional(),
    appliedScoreThreshold: FiniteNumberSchema.optional(),
    counts: RAGCountsSchema.optional(),
    timings: RAGTimingsSchema.optional(),
    streamed: z.boolean().optional(),
    generationModel: z.string().min(1).optional(),
    promptContext: z.string().optional(),
    retrievalMetadata: JsonObjectSchema.optional(),
    postRetrievalMetadata: JsonObjectSchema.optional(),
    generationMetadata: JsonObjectSchema.optional(),
    debug: JsonObjectSchema.optional(),
  })
  .superRefine(refineAuditSnapshot);
