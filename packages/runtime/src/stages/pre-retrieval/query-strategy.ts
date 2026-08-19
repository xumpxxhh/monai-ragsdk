import type { RetrievalRequest, RuntimeContext } from '../../types/index.js';

/** 消费并返回 RetrievalRequest，可串联实现 rewrite / expansion / routing 等。 */
export interface QueryStrategy {
  /** 稳定策略名，供 observer / appliedStrategies 对账；缺省时编排器用 query-strategy-${index}。 */
  readonly name?: string;
  apply(request: RetrievalRequest, context: RuntimeContext): Promise<RetrievalRequest>;
}
