import type { RetrievalPostprocessor } from "./retrieval-postprocessor.js";
import type { PostRetrievalStrategy } from "./post-retrieval-strategy.js";
import type {
  PostRetrievalResult,
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
} from "../../types/index.js";

import type { PassthroughRetrievalPostprocessorOptions } from "./passthrough-retrieval-postprocessor-options.js";
import { createBudgetTrimStrategy } from "./strategies/budget-trim-strategy.js";
import { createCandidateOrderingStrategy } from "./strategies/candidate-ordering-strategy.js";
import { createNearDuplicateRemovalStrategy } from "./strategies/near-duplicate-removal-strategy.js";
import { createPredicateFilterStrategy } from "./strategies/predicate-filter-strategy.js";
import { createScoreThresholdStrategy } from "./strategies/score-threshold-strategy.js";
import { createSourceCoverageStrategy } from "./strategies/source-coverage-strategy.js";
import { StrategyRetrievalPostprocessor } from "./strategy-retrieval-postprocessor.js";

export type { PassthroughRetrievalPostprocessorOptions };

/** 与 PassthroughRetrievalPostprocessor 历史默认顺序一致，便于行为等价迁移。 */
export function buildPassthroughStrategies(
  options: PassthroughRetrievalPostprocessorOptions = {},
): PostRetrievalStrategy[] {
  const strategies: PostRetrievalStrategy[] = [
    createScoreThresholdStrategy({
      scoreThreshold: options.scoreThreshold,
      applyRequestScoreThreshold: options.applyRequestScoreThreshold,
    }),
    createPredicateFilterStrategy(options.candidatePredicate),
    createNearDuplicateRemovalStrategy(options.nearDuplicateRemovalConfig),
    createBudgetTrimStrategy({
      budget: options.budget,
      applyRequestBudget: options.applyRequestBudget,
    }),
    createSourceCoverageStrategy(options.sourceCoverageConfig),
  ];

  if (options.orderCandidates) {
    strategies.push(createCandidateOrderingStrategy(options.orderCandidates));
  }

  return strategies;
}

/**
 * 历史默认 postprocessor：内部委托 StrategyRetrievalPostprocessor，
 * 策略顺序与选项语义与重构前保持一致。
 */
export class PassthroughRetrievalPostprocessor implements RetrievalPostprocessor {
  readonly #delegate: StrategyRetrievalPostprocessor;

  constructor(options: PassthroughRetrievalPostprocessorOptions = {}) {
    this.#delegate = new StrategyRetrievalPostprocessor({
      strategies: buildPassthroughStrategies(options),
      includeSelectionTrace: options.includeSelectionTrace,
      buildPromptContext: options.buildPromptContext,
    });
  }

  async postprocess(
    input: {
      request: RetrievalRequest;
      candidates: RetrievalCandidate[];
    },
    context: RuntimeContext,
  ): Promise<PostRetrievalResult> {
    return this.#delegate.postprocess(input, context);
  }
}
