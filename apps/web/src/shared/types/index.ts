/** API 边界类型，字段名与后端契约对齐。 */

export type UserRole = 'admin' | 'user';
export type CollectionHealth = 'healthy' | 'warning' | 'empty';
export type DocumentStatus = 'indexed' | 'failed' | 'unchanged' | 'pending';
export type IngestMode = 'incremental' | 'full';
export type StrategyPreset = 'balanced' | 'high_recall' | 'low_cost' | 'strict_cite';
export type UiDensity = 'compact' | 'comfortable';
export type LandingPage = 'home' | 'ask';
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

/** 单文档详情：含入库时登记的原始文本。 */
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

export interface AskMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  effectiveQuery?: string;
  interrupted?: boolean;
  noGrounding?: boolean;
  pipeline?: PipelineSnapshot;
  traceId?: string;
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
  /** observer 全链路；与 ask SSE execution-trace / 观测详情同源。 */
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

export type RAGEventScope = 'runtime' | 'indexing';

export type RAGEventAction =
  'receive' | 'preprocess' | 'start' | 'complete' | 'fail' | 'select' | 'drop' | 'store';

export type RAGEventName =
  `runtime.${string}.${RAGEventAction}` | `indexing.${string}.${RAGEventAction}`;

export type RAGAttributes = Record<string, unknown>;

export interface RAGEvent {
  traceId: string;
  scope: RAGEventScope;
  stage: string;
  name: RAGEventName;
  timestamp: number;
  durationMs?: number;
  attributes?: RAGAttributes;
}

export interface RAGErrorRecord {
  traceId: string;
  scope: RAGEventScope;
  stage: string;
  name: RAGEventName;
  timestamp: number;
  error: {
    name: string;
    message: string;
    code?: string;
  };
  attributes?: RAGAttributes;
}

export interface RAGTrace {
  traceId: string;
  requestId?: string;
  scope: RAGEventScope;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: 'ok' | 'error';
  tags?: Record<string, string | number | boolean>;
  events: RAGEvent[];
  errors?: RAGErrorRecord[];
  serviceName?: string;
  environment?: string;
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
  pipeline?: PipelineSnapshot;
  traceId?: string;
  executionTrace?: RAGTrace;
  /** 在线抽样快照；缺省时只能回退 observer（无完整 answer / sourceId）。 */
  evalSnapshot?: {
    answer: string;
    refused: boolean;
    retrieved: Array<{ chunkId: string; sourceId?: string; score?: number; rank: number }>;
    selected: Array<{ chunkId: string; sourceId?: string; text: string }>;
  };
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

export interface AppPreferences {
  density: UiDensity;
  landingPage: LandingPage;
  role: UserRole;
  showHealthCards: boolean;
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

export interface ApiErrorBody {
  message?: string;
  code?: string;
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

export type EvalMetricLayer = 'retrieved' | 'selected';

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
  layer: EvalMetricLayer;
  coverage: number;
  unscorable: boolean;
  mrr: number;
  atK: EvalMetricsAtK[];
}

export interface EvalAggregateReport {
  layer: EvalMetricLayer;
  scoredSampleCount: number;
  unscorableSampleCount: number;
  unscorableSampleIds: string[];
  meanMrr: number;
  meanAtK: EvalMetricsAtK[];
}

export interface EvalRunReport {
  label?: string;
  dataset: { name: string; version: string };
  layer: EvalMetricLayer;
  topK: number;
  collectionIds?: string[];
  samples: EvalSampleScoreReport[];
  aggregate: EvalAggregateReport;
}

export type EvalSampleDiffVerdict = 'improved' | 'regressed' | 'unchanged' | 'incomparable';

export interface EvalMetricsAtKDelta {
  k: number;
  recallDelta: number | null;
  precisionDelta: number | null;
  hitRateDelta: number | null;
  ndcgDelta: number | null;
}

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
  dataset: { name: string; version: string };
  layer: EvalMetricLayer;
  topK: number;
  primaryK: number;
  collectionIds?: string[];
  baseline: EvalRunReport;
  candidate: EvalRunReport;
  diff: EvalDiffReport;
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
  dataset: { name: string; version: string };
  collectionIds?: string[];
  samples: EvalJudgeSampleReport[];
  aggregate: EvalJudgeAggregateReport;
}

export interface EvalFromTracesRetrievalSampleReport extends EvalSampleScoreReport {
  traceId: string;
}

export interface EvalFromTracesJudgeSampleReport extends EvalJudgeSampleReport {
  traceId: string;
}

export interface EvalFromTracesReport {
  dataset: { name: string; version: string };
  layer: EvalMetricLayer;
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
