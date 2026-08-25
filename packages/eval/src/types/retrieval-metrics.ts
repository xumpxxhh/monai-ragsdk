/** 单样本、单 k 的 source 级检索指标切片。 */
export type RetrievalMetricsAtK = {
  k: number;
  recall: number;
  precision: number;
  hitRate: number;
  ndcg: number;
};

/** 单样本检索评分结果。 */
export type RetrievalSampleScore = {
  sampleId: string;
  layer: 'retrieved' | 'selected';
  /** 有 sourceId 的候选占全部候选比例；全缺时为 0。 */
  coverage: number;
  /** coverage 为 0 时不产出有效指标，聚合时分母剔除。 */
  unscorable: boolean;
  mrr: number;
  atK: RetrievalMetricsAtK[];
};

/** 多样本 macro 聚合报告。 */
export type AggregatedRetrievalMetrics = {
  layer: 'retrieved' | 'selected';
  scoredSampleCount: number;
  unscorableSampleCount: number;
  unscorableSampleIds: string[];
  meanMrr: number;
  meanAtK: RetrievalMetricsAtK[];
};

export type ScoreRetrievalSampleOptions = {
  layer?: 'retrieved' | 'selected';
  /** 默认 [1, 3, 5, 10]。 */
  k?: number[];
};

export type AggregateRetrievalMetricsOptions = {
  k?: number[];
};
