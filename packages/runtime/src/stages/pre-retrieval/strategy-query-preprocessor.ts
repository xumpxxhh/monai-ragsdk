import type { QueryPreprocessor } from './query-preprocessor.js';
import type { QueryStrategy } from './query-strategy.js';
import type { RetrievalRequest, RuntimeContext, RuntimeQueryInput } from '../../types/index.js';

import { NoopQueryPreprocessor } from './noop-query-preprocessor.js';

export type StrategyQueryPreprocessorOptions = {
  base?: QueryPreprocessor;
  strategies: QueryStrategy[];
};

/**
 * 先用 base 产出初始 RetrievalRequest，再按顺序跑 query 策略链；
 * 对外仍是一个 QueryPreprocessor，run() / runStream() 主流程无需改动。
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

    for (const strategy of this.#strategies) {
      request = await strategy.apply(request, context);
    }
    console.log('###@@@request####\n', request);
    return request;
  }
}
