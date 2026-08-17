import type { RetrievalPostprocessor } from "../interfaces/retrieval-postprocessor.js";
import type {
  PostRetrievalResult,
  RetrievalBudget,
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
} from "../types/index.js";
import {
  applyCandidateOrderingStrategy,
  applyCandidatePredicateStrategy,
  applyBudgetTrimStrategy,
  applyNearDuplicateRemovalStrategy,
  applyScoreThresholdStrategy,
  applySourceCoverageStrategy,
  type CandidateComparator,
  type CandidatePredicate,
  type NearDuplicateRemovalConfig,
  type SourceCoverageConfig,
  mergeSelectionTrace,
} from "./post-retrieval-strategies.js";

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

function defaultPromptContext(
  request: RetrievalRequest,
  candidates: RetrievalCandidate[],
): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  return [
    `query: ${request.effectiveQuery.query}`,
    ...candidates.map((candidate) => candidate.chunk.content),
  ].join("\n\n");
}

export class PassthroughRetrievalPostprocessor implements RetrievalPostprocessor {
  constructor(
    private readonly options: PassthroughRetrievalPostprocessorOptions = {},
  ) {}

  async postprocess(
    input: {
      request: RetrievalRequest;
      candidates: RetrievalCandidate[];
    },
    context: RuntimeContext,
  ): Promise<PostRetrievalResult> {
    const scoreThreshold =
      this.options.scoreThreshold ??
      (this.options.applyRequestScoreThreshold !== false
        ? input.request.rerank?.minScore
        : undefined);
    const afterScoreThreshold = applyScoreThresholdStrategy(
      input.candidates,
      scoreThreshold,
    );
    const afterPredicateFilter = await applyCandidatePredicateStrategy(
      afterScoreThreshold.selectedCandidates,
      this.options.candidatePredicate,
      {
        request: input.request,
        context,
      },
    );
    const afterNearDuplicateRemoval = applyNearDuplicateRemovalStrategy(
      afterPredicateFilter.selectedCandidates,
      this.options.nearDuplicateRemovalConfig,
      {
        request: input.request,
        context,
      },
    );
    const appliedBudget =
      this.options.budget ??
      (this.options.applyRequestBudget === false
        ? undefined
        : input.request.budget);
    const afterBudgetTrim = applyBudgetTrimStrategy(
      afterNearDuplicateRemoval.selectedCandidates,
      appliedBudget,
    );
    const afterSourceCoverage = applySourceCoverageStrategy(
      afterBudgetTrim.selectedCandidates,
      this.options.sourceCoverageConfig,
    );
    const afterOrdering = applyCandidateOrderingStrategy(
      afterSourceCoverage.selectedCandidates,
      this.options.orderCandidates,
      {
        request: input.request,
        context,
      },
    );
    const selectedCandidates = afterOrdering.candidates;
    const droppedCandidates = [
      ...afterScoreThreshold.droppedCandidates,
      ...afterPredicateFilter.droppedCandidates,
      ...afterNearDuplicateRemoval.droppedCandidates,
      ...afterBudgetTrim.droppedCandidates,
      ...afterSourceCoverage.droppedCandidates,
    ];

    return {
      chunks: selectedCandidates.map((candidate) => candidate.chunk),
      selectedCandidates,
      droppedCandidates,
      ...(this.options.includeSelectionTrace === false
        ? {}
        : {
            selectionTrace: mergeSelectionTrace(
              afterScoreThreshold.selectionTrace,
              afterPredicateFilter.selectionTrace,
              afterNearDuplicateRemoval.selectionTrace,
              afterBudgetTrim.selectionTrace,
              afterSourceCoverage.selectionTrace,
              afterOrdering.selectionTrace,
            ),
          }),
      appliedBudget: afterBudgetTrim.appliedBudget,
      appliedScoreThreshold: afterScoreThreshold.appliedScoreThreshold,
      promptContext:
        this.options.buildPromptContext?.(input.request, selectedCandidates) ??
        defaultPromptContext(input.request, selectedCandidates),
    };
  }
}
