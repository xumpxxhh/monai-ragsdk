import { z } from 'zod';

import {
  RAGBudgetSchema,
  RAGCitationSchema,
  RAGCountsSchema,
  RAGFiltersSchema,
  RAGRerankSchema,
  RAGResponseSchema,
  RAGRetrievedCandidateSchema,
  RAGSelectionTraceEntrySchema,
  RAGStageStrategiesSchema,
  RAGTimingsSchema,
} from '../spec/rag-response.js';

export type RAGCitation = z.infer<typeof RAGCitationSchema>;
export type RAGSelectionTraceEntry = z.infer<typeof RAGSelectionTraceEntrySchema>;
export type RAGStageStrategies = z.infer<typeof RAGStageStrategiesSchema>;
export type RAGFilters = z.infer<typeof RAGFiltersSchema>;
export type RAGBudget = z.infer<typeof RAGBudgetSchema>;
export type RAGRerank = z.infer<typeof RAGRerankSchema>;
export type RAGCounts = z.infer<typeof RAGCountsSchema>;
export type RAGTimings = z.infer<typeof RAGTimingsSchema>;
export type RAGRetrievedCandidate = z.infer<typeof RAGRetrievedCandidateSchema>;
export type RAGResponse = z.infer<typeof RAGResponseSchema>;
