import type { RAGTrace } from '@monai-ragsdk/observability';

/** 与 apps/web `shared/types` 对齐的 API 边界类型，字段名不另造。 */

export type UserRole = 'admin' | 'user';
export type CollectionHealth = 'healthy' | 'warning' | 'empty';
export type DocumentStatus = 'indexed' | 'failed' | 'unchanged' | 'pending';
export type IngestMode = 'incremental' | 'full';
export type StrategyPreset = 'balanced' | 'high_recall' | 'low_cost' | 'strict_cite';
export type ConnectionStatus = 'connected' | 'unconfigured';

export interface CollectionSummary {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  health: CollectionHealth;
  presetLabel: string;
  failedIngestCount: number;
  lastIngestAt: string | null;
}

export interface CollectionDetail extends CollectionSummary {
  createdAt: string;
}

export interface IngestStats {
  added: number;
  skipped: number;
  replaced: number;
  failed: number;
  cleaned: number;
}

export interface LastIngestSummary {
  finishedAt: string;
  mode: IngestMode;
  stats: IngestStats;
}

export interface DocumentSource {
  id: string;
  collectionId: string;
  sourceId: string;
  title: string;
  status: DocumentStatus;
  updatedAt: string;
  failReason?: string;
}

/** 单文档详情：列表不含原文，详情按需带回入库时登记的 content。 */
export interface DocumentDetail extends DocumentSource {
  content: string;
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  ingestMode: IngestMode;
}

export interface ActivityItem {
  id: string;
  time: string;
  kind: 'ingest' | 'ask' | 'strategy' | 'alert';
  title: string;
  detail?: string;
  stats?: IngestStats;
  collectionId?: string;
  collectionName?: string;
}

export interface DashboardStats {
  documentCount: number;
  lastIngestSuccess: boolean;
  lastIngestAt: string | null;
  askCount7d: number;
  avgCitations: number;
  failedIngestCount: number;
}

export interface Citation {
  index: number;
  sourceId: string;
  title: string;
  snippet: string;
  score: number;
}

export interface SearchHit {
  rank: number;
  sourceId: string;
  title: string;
  score: number;
  snippet: string;
}

export interface PipelineSnapshotPreRetrieval {
  originalQuery: string;
  effectiveQuery: string;
  subQueries?: string[];
  strategies?: string[];
  rewriteReason?: string;
}

export interface PipelineSnapshotRetrieval {
  retrieved?: number;
  skipped?: boolean;
  skipReason?: string;
  retrieverCount?: number;
  fusedCandidateCount?: number;
  strategies?: string[];
}

export interface PipelineSnapshotPostRetrieval {
  selected?: number;
  dropped?: number;
  finalChunks?: number;
  strategies?: string[];
}

export interface PipelineSnapshotGeneration {
  citationCount: number;
  groundingRefusal?: boolean;
  chunksEmptyReason?: string;
  noGroundingPolicy?: 'explicit' | 'generalize';
  strategies?: string[];
}

export interface PipelineSnapshotTimings {
  preRetrieval?: number;
  retrieval?: number;
  postRetrieval?: number;
  generation?: number;
  total?: number;
}

/** 一次 ask / search 的四段 runtime 摘要，供管理员检查面与观测详情复用。 */
export interface PipelineSnapshot {
  traceId: string;
  preRetrieval: PipelineSnapshotPreRetrieval;
  retrieval: PipelineSnapshotRetrieval;
  postRetrieval: PipelineSnapshotPostRetrieval;
  generation?: PipelineSnapshotGeneration;
  timings?: PipelineSnapshotTimings;
}

export interface SearchResult {
  query: string;
  effectiveQuery?: string;
  hits: SearchHit[];
  appliedFilters: string[];
  traceId: string;
  pipeline: PipelineSnapshot;
  /** observer 全链路；进程内存，与 GET /traces/ask/:id 同源。 */
  executionTrace?: RAGTrace;
}

export interface StrategyConfig {
  collectionId: string;
  preset: StrategyPreset;
  preRetrieval: {
    rewrite: boolean;
    expansion: boolean;
    decomposition: boolean;
    multiQuery: boolean;
    routing: boolean;
  };
  retrieval: {
    topK: number;
  };
  postRetrieval: {
    scoreThreshold: boolean;
    scoreThresholdValue: number;
    dedupe: boolean;
    contextBudget: boolean;
    contextBudgetMax: number;
    sourceCoverage: boolean;
    rerank: boolean;
    compression: boolean;
    lostInMiddle: boolean;
  };
  generation: {
    citations: boolean;
    activeRag: boolean;
    noGroundingPolicy: 'explicit' | 'generalize';
  };
}

export interface TraceStage {
  id: string;
  label: string;
  detail?: string;
  durationMs?: number;
  warning?: boolean;
}

export interface AskTrace {
  id: string;
  collectionId: string;
  collectionName: string;
  question: string;
  effectiveQuestion?: string;
  finishedAt: string;
  durationMs: number;
  success: boolean;
  citationCount: number;
  stages: TraceStage[];
  warnings: string[];
  /** 与 ask SSE result.pipeline 同构，观测详情不必只靠 timings 键名猜阶段。 */
  pipeline?: PipelineSnapshot;
  /** observer / runtime 侧 traceId；与 id 一致时仍显式写出，便于前端对齐 SSE。 */
  traceId?: string;
  /** observer 全链路快照；GET 详情时若缺失可回退 memoryExporter。 */
  executionTrace?: RAGTrace;
  /**
   * 在线抽样用的完整答案与检索观测。
   * observer 只有 answerPreview（200 字）且 candidates 无 sourceId，不能替代本字段。
   */
  evalSnapshot?: AskEvalSnapshot;
}

/** 从 RuntimeResult 抽出、写入 AskTrace 的评测快照；不含 observer 协议。 */
export interface AskEvalSnapshot {
  answer: string;
  refused: boolean;
  retrieved: Array<{
    chunkId: string;
    sourceId?: string;
    score?: number;
    rank: number;
  }>;
  selected: Array<{
    chunkId: string;
    sourceId?: string;
    text: string;
  }>;
}

export interface IngestTaskTrace {
  id: string;
  collectionId: string;
  collectionName: string;
  finishedAt: string;
  mode: IngestMode;
  stats: IngestStats;
  success: boolean;
}

export interface ConnectionInfo {
  embedding: ConnectionStatus;
  chat: ConnectionStatus;
  vectorStore: ConnectionStatus;
}

export interface IngestProgressEvent {
  current: number;
  total: number;
  fileName: string;
  stats: IngestStats;
  log?: string;
  done: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ChunkingStrategy = 'fixed' | 'heading' | 'parent-child';

export interface ChunkingConfig {
  strategy?: ChunkingStrategy;
  chunkSize?: number;
  overlap?: number;
}

export interface IngestRecommendation {
  chunking: ChunkingConfig & { strategy: ChunkingStrategy };
  loaderHint: string;
  mode: IngestMode;
}

export interface GlobalAskRequest {
  question: string;
  collectionIds?: string[];
}

export interface GlobalSearchRequest {
  query: string;
  topK?: number;
  collectionIds?: string[];
}

/** POST /eval/run：inline golden 数据集 + 可选 scope / topK / layer / @k。 */
export interface EvalRunRequest {
  dataset: unknown;
  collectionIds?: string[];
  topK?: number;
  layer?: 'retrieved' | 'selected';
  k?: number[];
}

export interface EvalMetricsAtK {
  k: number;
  recall: number;
  precision: number;
  hitRate: number;
  ndcg: number;
}

export interface EvalSampleScoreReport {
  sampleId: string;
  query: string;
  layer: 'retrieved' | 'selected';
  coverage: number;
  unscorable: boolean;
  mrr: number;
  atK: EvalMetricsAtK[];
}

export interface EvalAggregateReport {
  layer: 'retrieved' | 'selected';
  scoredSampleCount: number;
  unscorableSampleCount: number;
  unscorableSampleIds: string[];
  meanMrr: number;
  meanAtK: EvalMetricsAtK[];
}

export interface EvalRunReport {
  label?: string;
  dataset: {
    name: string;
    version: string;
  };
  layer: 'retrieved' | 'selected';
  topK: number;
  collectionIds?: string[];
  samples: EvalSampleScoreReport[];
  aggregate: EvalAggregateReport;
}

export interface EvalCompareArm {
  label: string;
  /** 省略时使用当前全局策略。 */
  strategy?: StrategyConfig;
}

/** POST /eval/compare：同一 dataset 在两套策略下各跑一遍并 diff。 */
export interface EvalCompareRequest {
  dataset: unknown;
  baseline: EvalCompareArm;
  candidate: EvalCompareArm;
  collectionIds?: string[];
  topK?: number;
  layer?: 'retrieved' | 'selected';
  k?: number[];
  /** MRR 持平时用 recall@primaryK 判定样本 improved/regressed。 */
  primaryK?: number;
}

export interface EvalMetricsAtKDelta {
  k: number;
  recallDelta: number | null;
  precisionDelta: number | null;
  hitRateDelta: number | null;
  ndcgDelta: number | null;
}

export type EvalSampleDiffVerdict = 'improved' | 'regressed' | 'unchanged' | 'incomparable';

export interface EvalSampleDiffReport {
  sampleId: string;
  verdict: EvalSampleDiffVerdict;
  baseline: EvalSampleScoreReport;
  candidate: EvalSampleScoreReport;
  mrrDelta: number | null;
  atKDelta: EvalMetricsAtKDelta[];
}

export interface EvalDiffReport {
  baselineLabel: string;
  candidateLabel: string;
  primaryK: number;
  aggregateDelta: {
    meanMrrDelta: number;
    meanAtKDelta: EvalMetricsAtKDelta[];
    scoredSampleCountDelta: number;
    unscorableSampleCountDelta: number;
  };
  sampleDiffs: EvalSampleDiffReport[];
  improvedSampleIds: string[];
  regressedSampleIds: string[];
  unchangedSampleIds: string[];
  incomparableSampleIds: string[];
}

export interface EvalCompareReport {
  dataset: {
    name: string;
    version: string;
  };
  layer: 'retrieved' | 'selected';
  topK: number;
  primaryK: number;
  collectionIds?: string[];
  baseline: EvalRunReport;
  candidate: EvalRunReport;
  diff: EvalDiffReport;
}

/** POST /eval/judge：逐条 runtime.run + LLM 生成 judge。 */
export interface EvalJudgeRequest {
  dataset: unknown;
  collectionIds?: string[];
  /** 省略时使用当前全局策略。 */
  strategy?: StrategyConfig;
}

export interface EvalJudgeSampleReport {
  sampleId: string;
  query: string;
  answer: string;
  refused: boolean;
  faithfulness: number | null;
  relevance: number | null;
  refusalCorrectness: number | null;
  unscorable: boolean;
  rationale?: string;
  parseError?: string;
}

export interface EvalJudgeAggregateReport {
  scoredSampleCount: number;
  unscorableSampleCount: number;
  unscorableSampleIds: string[];
  meanFaithfulness: number | null;
  meanRelevance: number | null;
  meanRefusalCorrectness: number | null;
  faithfulnessSampleCount: number;
  relevanceSampleCount: number;
  refusalSampleCount: number;
}

export interface EvalJudgeReport {
  dataset: {
    name: string;
    version: string;
  };
  collectionIds?: string[];
  samples: EvalJudgeSampleReport[];
  aggregate: EvalJudgeAggregateReport;
}

/** POST /eval/from-traces：用已落盘的 ask 轨迹对照 golden 打分，不再跑 pipeline。 */
export interface EvalFromTracesRequest {
  dataset: unknown;
  /** 指定轨迹；省略则用当前内存中的 ask traces（JSONL 启动加载，最多 100 条）。 */
  traceIds?: string[];
  collectionId?: string;
  layer?: 'retrieved' | 'selected';
  k?: number[];
  /** 有完整 answer 时是否跑生成 judge；默认 true。缺快照的旧轨迹仍跳过 judge。 */
  includeJudge?: boolean;
}

export interface EvalFromTracesRetrievalSampleReport extends EvalSampleScoreReport {
  traceId: string;
}

export interface EvalFromTracesJudgeSampleReport extends EvalJudgeSampleReport {
  traceId: string;
}

export interface EvalFromTracesReport {
  dataset: {
    name: string;
    version: string;
  };
  layer: 'retrieved' | 'selected';
  collectionId?: string;
  matchedSampleCount: number;
  unmatchedSampleIds: string[];
  skippedJudgeSampleIds: string[];
  retrieval: {
    samples: EvalFromTracesRetrievalSampleReport[];
    aggregate: EvalAggregateReport;
  };
  judge?: {
    samples: EvalFromTracesJudgeSampleReport[];
    aggregate: EvalJudgeAggregateReport;
  };
}

export interface IngestDocumentInput {
  id?: string;
  content: string;
  metadata?: {
    title?: string;
    sourceId?: string;
    mimeType?: string;
  };
}
