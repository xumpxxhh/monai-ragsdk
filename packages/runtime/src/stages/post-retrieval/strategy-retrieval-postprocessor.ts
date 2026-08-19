import type { RetrievalPostprocessor } from './retrieval-postprocessor.js';
import type { PostRetrievalStrategy } from './post-retrieval-strategy.js';
import type {
  PostRetrievalResult,
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
} from '../../types/index.js';

import { mergeSelectionTrace } from './strategies/post-retrieval-strategies.js';
import {
  buildObservationAttributes,
  compactSelectionDecisions,
  emitRuntimeObservation,
  emitRuntimeObservationError,
  toObservationError,
} from '../../observation/index.js';

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

function isPostStrategyPassthrough(
  inputCandidates: RetrievalCandidate[],
  selected: RetrievalCandidate[],
  droppedCount: number,
  compressedCount: number,
): boolean {
  if (droppedCount > 0 || compressedCount > 0) {
    return false;
  }

  if (selected.length !== inputCandidates.length) {
    return false;
  }

  return selected.every(
    (candidate, index) => candidate.chunk.id === inputCandidates[index]?.chunk.id,
  );
}

/**
 * 按 strategies 数组顺序依次执行 post-retrieval 策略；
 * 统一合并 dropped、trace 与 promptContext，供自定义策略链复用。
 * 每条策略打 post_retrieval_strategy.complete / fail，正文不进 observer。
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
    const appliedStrategies: string[] = [];
    let appliedBudget: PostRetrievalResult['appliedBudget'];
    let appliedScoreThreshold: PostRetrievalResult['appliedScoreThreshold'];

    for (let index = 0; index < this.#strategies.length; index += 1) {
      const strategy = this.#strategies[index]!;
      const strategyName = strategy.name ?? `post-retrieval-strategy-${index}`;
      const startedAt = Date.now();
      const inputCandidates = candidates;
      const strategyRef = { name: strategyName, index };

      try {
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

        const compressedCount = result.selectedCandidates.filter(
          (candidate) => candidate.compressed,
        ).length;
        const passthrough = isPostStrategyPassthrough(
          inputCandidates,
          result.selectedCandidates,
          result.droppedCandidates.length,
          compressedCount,
        );
        // 与 pre-retrieval 对齐：没改候选顺序/集合就不进审计清单。
        if (!passthrough) {
          appliedStrategies.push(strategyName);
        }

        await emitRuntimeObservation(context, {
          stage: 'post_retrieval_strategy',
          action: 'complete',
          timestamp: Date.now(),
          durationMs: Date.now() - startedAt,
          attributes: buildObservationAttributes({
            strategy: strategyRef,
            outcome: passthrough ? 'passthrough' : 'applied',
            counts: {
              input: inputCandidates.length,
              selected: result.selectedCandidates.length,
              dropped: result.droppedCandidates.length,
              ...(compressedCount > 0 ? { compressed: compressedCount } : {}),
            },
            decisions: compactSelectionDecisions(result.selectionTrace, strategyName),
          }),
        });
      } catch (error) {
        const observationError = toObservationError(error);
        const failRecord = {
          stage: 'post_retrieval_strategy',
          action: 'fail' as const,
          timestamp: Date.now(),
          durationMs: Date.now() - startedAt,
          attributes: buildObservationAttributes({
            strategy: strategyRef,
            outcome: 'failed',
            error: observationError,
          }),
          error: observationError,
        };

        await emitRuntimeObservation(context, failRecord);
        await emitRuntimeObservationError(context, failRecord);
        throw error;
      }
    }

    return {
      chunks: candidates.map((candidate) => candidate.chunk),
      selectedCandidates: candidates,
      droppedCandidates,
      appliedStrategies,
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
