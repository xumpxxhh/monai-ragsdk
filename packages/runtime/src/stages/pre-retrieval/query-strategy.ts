import type { RetrievalRequest, RuntimeContext } from '../../types/index.js';

/** 消费并返回 RetrievalRequest，可串联实现 rewrite / expansion / routing 等。 */
export interface QueryStrategy {
  apply(request: RetrievalRequest, context: RuntimeContext): Promise<RetrievalRequest>;
}
