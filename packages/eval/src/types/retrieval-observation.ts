import type { z } from 'zod';

import type {
  RetrievedCandidateObservationSchema,
  RetrievalObservationSchema,
  SelectedChunkObservationSchema,
} from '../spec/retrieval-observation.js';

export type RetrievedCandidateObservation = z.infer<typeof RetrievedCandidateObservationSchema>;
export type SelectedChunkObservation = z.infer<typeof SelectedChunkObservationSchema>;
export type RetrievalObservation = z.infer<typeof RetrievalObservationSchema>;

/** 指标计算使用的观测层：召回候选 vs 最终入 prompt。 */
export type RetrievalMetricLayer = 'retrieved' | 'selected';
