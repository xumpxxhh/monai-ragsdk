import { z } from 'zod';

/** 召回层单条候选；rank 由 mapper 按 retrievedCandidates 顺序写入（1-based）。 */
export const RetrievedCandidateObservationSchema = z.object({
  chunkId: z.string().min(1),
  sourceId: z.string().min(1).optional(),
  score: z.number().finite().optional(),
  rank: z.number().int().min(1),
});

/** 入 prompt 层单条 chunk；顺序即 rank，评测侧按数组下标推导。 */
export const SelectedChunkObservationSchema = z.object({
  chunkId: z.string().min(1),
  sourceId: z.string().min(1).optional(),
});

/**
 * 检索观测快照：分召回层与选留层，对应 runtime.search/run 的两个审计切面。
 * eval 不绑定 RAGResponse，由 apps mapper 填充。
 */
export const RetrievalObservationSchema = z.object({
  retrieved: z.array(RetrievedCandidateObservationSchema),
  selected: z.array(SelectedChunkObservationSchema),
});
