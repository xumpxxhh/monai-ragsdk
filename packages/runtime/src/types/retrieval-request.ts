import type { JsonValue, Query } from '@monai-ragsdk/core';

import type { RetrievalBudget } from './retrieval-budget.js';
import type { RetrievalFilters } from './retrieval-filters.js';
import type { RetrievalRerankPolicy } from './retrieval-rerank-policy.js';
import type { RouteDecision } from './route-decision.js';

export type RetrievalRequest = {
  originalQuery: Query;
  effectiveQuery: Query;
  /** 由 expansion / decomposition / multi-query 等 pre-retrieval 策略产出；retrieval 阶段 fan-out 消费。 */
  subQueries?: Query[];
  /**
   * @deprecated 历史条数别名，内核不直接消费。
   * 仅当 `budget.maxChunks` 缺省时由 `applyRetrievalTopKAlias` 单向补齐；二者都有时以 budget 为准。
   */
  topK?: number;
  /** 租户/来源隔离等；runtime 在 retrieve 之后强制应用，adapter 不能关掉。 */
  filters?: RetrievalFilters;
  /**
   * debug-only：末次策略名（rewrite / route 等可能写入）。
   * 实际跑过的 pre-retrieval 清单以 `appliedStrategies` 为准。
   */
  strategy?: string;
  /**
   * debug-only：query-routing 的分类标签。检索/生成行为不读这个字段。
   * 去哪检索 / 怎么检索 / 是否跳过以 `routeDecision` 为准。
   */
  route?: string;
  /** 结构化选路；FanOut 读 targets/skip，底层 retriever 读 searchType。 */
  routeDecision?: RouteDecision;
  rewriteReason?: string;
  /**
   * query-time unused：索引期概念泄漏到查询请求上，仅 Noop / audit 透传。
   */
  indexingMode?: 'full' | 'incremental';
  budget?: RetrievalBudget;
  rerank?: RetrievalRerankPolicy;
  /**
   * 真正改变了检索意图的 pre-retrieval 策略名，按执行顺序。
   * 失败或透传只打 observer，不进这份清单。
   */
  appliedStrategies?: string[];
  /**
   * 内核不消费的透传袋。Noop 从 `RuntimeQueryInput.metadata` 拷入，留给自定义 retriever。
   */
  metadata?: Record<string, JsonValue>;
};
