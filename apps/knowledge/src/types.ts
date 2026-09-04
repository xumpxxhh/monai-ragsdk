import type { GenerationChunksEmptyReason } from '@monai-ragsdk/runtime';

export type ConnectionStatus = 'connected' | 'unconfigured';

export type StrategyPreset = 'balanced' | 'high_recall' | 'low_cost' | 'strict_cite';

/** 与控制台 state.json 中的 globalStrategy 同构（只读消费）。 */
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

export interface KnowledgeCollectionSummary {
  id: string;
  name: string;
  description: string;
  documentCount: number;
}

export interface KnowledgeSearchRequest {
  query: string;
  collectionIds?: string[];
  topK?: number;
}

export type KnowledgeScoreKind = 'retriever' | 'rrf' | 'llm';

export interface KnowledgeSearchHit {
  rank: number;
  collectionId?: string;
  sourceId: string;
  title: string;
  content: string;
  score: number;
  scoreKind?: KnowledgeScoreKind;
}

export interface KnowledgeSearchGrounding {
  empty: boolean;
  chunksEmptyReason?: GenerationChunksEmptyReason;
}

export interface KnowledgeSearchResult {
  query: string;
  effectiveQuery?: string;
  traceId: string;
  hits: KnowledgeSearchHit[];
  grounding: KnowledgeSearchGrounding;
}

export interface HealthResponse {
  ok: true;
  embedding: ConnectionStatus;
  vectorStore: ConnectionStatus;
}
