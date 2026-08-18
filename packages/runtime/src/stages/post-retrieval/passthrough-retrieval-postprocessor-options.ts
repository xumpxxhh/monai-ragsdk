import type {
  RetrievalBudget,
  RetrievalCandidate,
  RetrievalRequest,
} from "../../types/index.js";

import type {
  CandidateComparator,
  CandidatePredicate,
  NearDuplicateRemovalConfig,
  SourceCoverageConfig,
} from "./strategies/post-retrieval-strategies.js";

export type PassthroughRetrievalPostprocessorOptions = {
  scoreThreshold?: number;
  budget?: RetrievalBudget;
  applyRequestScoreThreshold?: boolean;
  applyRequestBudget?: boolean;
  includeSelectionTrace?: boolean;
  candidatePredicate?: CandidatePredicate;
  nearDuplicateRemovalConfig?: NearDuplicateRemovalConfig;
  sourceCoverageConfig?: SourceCoverageConfig;
  orderCandidates?: CandidateComparator;
  buildPromptContext?: (
    request: RetrievalRequest,
    candidates: RetrievalCandidate[],
  ) => string | undefined;
};
