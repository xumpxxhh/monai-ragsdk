import type { QueryPreprocessor } from './query-preprocessor.js';
import type { QueryStrategy } from './query-strategy.js';
import type { RetrievalRequest, RuntimeContext, RuntimeQueryInput } from '../../types/index.js';

import { NoopQueryPreprocessor } from './noop-query-preprocessor.js';
import {
  buildObservationAttributes,
  emitRuntimeObservation,
  emitRuntimeObservationError,
  isQueryStrategyPassthrough,
  queryIntentSnapshot,
  toObservationError,
} from '../../observation/index.js';

export type StrategyQueryPreprocessorOptions = {
  base?: QueryPreprocessor;
  strategies: QueryStrategy[];
};

/**
 * 先用 base 产出初始 RetrievalRequest，再按顺序跑 query 策略链；
 * 对外仍是一个 QueryPreprocessor，run() / runStream() 主流程无需改动。
 * 每条策略打 query_strategy.complete / fail，并把 appliedStrategies 写回 request。
 */
export class StrategyQueryPreprocessor implements QueryPreprocessor {
  readonly #base: QueryPreprocessor;
  readonly #strategies: QueryStrategy[];

  constructor(options: StrategyQueryPreprocessorOptions) {
    this.#base = options.base ?? new NoopQueryPreprocessor();
    this.#strategies = options.strategies;
  }

  async preprocess(input: RuntimeQueryInput, context: RuntimeContext): Promise<RetrievalRequest> {
    let request = await this.#base.preprocess(input, context);
    const appliedStrategies = [...(request.appliedStrategies ?? [])];

    for (let index = 0; index < this.#strategies.length; index += 1) {
      const strategy = this.#strategies[index]!;
      const strategyName = strategy.name ?? `query-strategy-${index}`;
      const startedAt = Date.now();
      const before = request;
      const strategyRef = { name: strategyName, index };

      try {
        const next = await strategy.apply(request, context);
        const passthrough = isQueryStrategyPassthrough(before, next);
        appliedStrategies.push(strategyName);
        request = {
          ...next,
          appliedStrategies: [...appliedStrategies],
        };

        await emitRuntimeObservation(context, {
          stage: 'query_strategy',
          action: 'complete',
          timestamp: Date.now(),
          durationMs: Date.now() - startedAt,
          attributes: buildObservationAttributes({
            strategy: strategyRef,
            outcome: passthrough ? 'passthrough' : 'applied',
            input: queryIntentSnapshot(before),
            output: queryIntentSnapshot(request),
          }),
        });
      } catch (error) {
        const observationError = toObservationError(error);
        const failRecord = {
          stage: 'query_strategy',
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

    return request;
  }
}
