import type { RetrievalPostprocessor } from './retrieval-postprocessor.js';
import type { PostRetrievalStrategy } from './post-retrieval-strategy.js';
import type {
  PostRetrievalResult,
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
} from '../../types/index.js';

import { mergeSelectionTrace } from './strategies/post-retrieval-strategies.js';

export type StrategyRetrievalPostprocessorOptions = {
  strategies: PostRetrievalStrategy[];
  includeSelectionTrace?: boolean;
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
  ].join('\n\n');
}

/**
 * 按 strategies 数组顺序依次执行 post-retrieval 策略；
 * 统一合并 dropped、trace 与 promptContext，供自定义策略链复用。
 */
export class StrategyRetrievalPostprocessor implements RetrievalPostprocessor {
  readonly #strategies: PostRetrievalStrategy[];
  readonly #includeSelectionTrace: boolean;
  readonly #buildPromptContext: StrategyRetrievalPostprocessorOptions['buildPromptContext'];

  constructor(options: StrategyRetrievalPostprocessorOptions) {
    this.#strategies = options.strategies;
    this.#includeSelectionTrace = options.includeSelectionTrace !== false;
    this.#buildPromptContext = options.buildPromptContext;
  }

  async postprocess(
    input: {
      request: RetrievalRequest;
      candidates: RetrievalCandidate[];
    },
    context: RuntimeContext,
  ): Promise<PostRetrievalResult> {
    let candidates = input.candidates;
    const droppedCandidates: RetrievalCandidate[] = [];
    const selectionTraces: Array<PostRetrievalResult['selectionTrace']> = [];
    let appliedBudget: PostRetrievalResult['appliedBudget'];
    let appliedScoreThreshold: PostRetrievalResult['appliedScoreThreshold'];

    for (const strategy of this.#strategies) {
      const result = await strategy.apply({ request: input.request, candidates }, context);
      candidates = result.selectedCandidates;
      droppedCandidates.push(...result.droppedCandidates);

      if (result.selectionTrace) {
        selectionTraces.push(result.selectionTrace);
      }

      if (result.appliedBudget !== undefined) {
        appliedBudget = result.appliedBudget;
      }

      if (result.appliedScoreThreshold !== undefined) {
        appliedScoreThreshold = result.appliedScoreThreshold;
      }
    }

    return {
      chunks: candidates.map((candidate) => candidate.chunk),
      selectedCandidates: candidates,
      droppedCandidates,
      ...(this.#includeSelectionTrace
        ? { selectionTrace: mergeSelectionTrace(...selectionTraces) }
        : {}),
      appliedBudget,
      appliedScoreThreshold,
      promptContext:
        this.#buildPromptContext?.(input.request, candidates) ??
        defaultPromptContext(input.request, candidates),
    };
  }
}
