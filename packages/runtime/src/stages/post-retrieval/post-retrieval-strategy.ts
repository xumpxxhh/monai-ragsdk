import type {
  PostRetrievalSelectionTraceEntry,
  RetrievalBudget,
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
} from '../../types/index.js';

/** 单个 post-retrieval 策略的输出；ordering 类策略只重排，dropped 可为空。 */
export type PostRetrievalStrategyResult = {
  selectedCandidates: RetrievalCandidate[];
  droppedCandidates: RetrievalCandidate[];
  selectionTrace?: PostRetrievalSelectionTraceEntry[];
  appliedBudget?: RetrievalBudget;
  appliedScoreThreshold?: number;
};

export interface PostRetrievalStrategy {
  apply(
    input: {
      request: RetrievalRequest;
      candidates: RetrievalCandidate[];
    },
    context: RuntimeContext,
  ): Promise<PostRetrievalStrategyResult>;
}
