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

export interface SearchResult {
  query: string;
  effectiveQuery?: string;
  hits: SearchHit[];
  appliedFilters: string[];
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

export interface IngestDocumentInput {
  id?: string;
  content: string;
  metadata?: {
    title?: string;
    sourceId?: string;
  };
}
