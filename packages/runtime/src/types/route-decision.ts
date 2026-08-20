import type { RuntimeRetrieverSearchType } from '../stages/retrieval/runtime-retriever.js';

export type RouteRetrievalMode = 'skip' | 'single';

/**
 * pre-retrieval 产出的选路结果。retrieval 只读这份，不读 `request.route`。
 * 缺字段表示「这一维不改」：无 targets 不过滤子 retriever；无 searchType 保持 retriever 默认召回。
 */
export type RouteDecision = {
  /** 匹配子 retriever 的 `id`。缺省：不按目标过滤。空数组与 skip 一样主动不检索。 */
  targets?: string[];
  /** 缺省视为 `single`。 */
  retrievalMode?: RouteRetrievalMode;
  /** 必须改变召回形态（由声明了对应能力的 retriever 执行）。 */
  searchType?: RuntimeRetrieverSearchType;
};
