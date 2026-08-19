import type { Chunk, JsonValue } from '@monai-ragsdk/core';

/**
 * 候选分数的量纲。RRF（约 0.01–0.03）与余弦/检索原分（常 0.7+）以及 LLM 重排分不可比，
 * 决策层必须带上口径，禁止把裸数字当同一阈值用。
 */
export type RetrievalScoreKind = 'retriever' | 'rrf' | 'llm';

export type RetrievalCandidate = {
  chunk: Chunk;
  score?: number;
  /** 与 score 同生同灭；有 score 却缺口径时，阈值策略应拒绝比较而不是当余弦分。 */
  scoreKind?: RetrievalScoreKind;
  route?: string;
  strategy?: string;
  sourceId?: string;
  fingerprint?: string;
  hierarchyPath?: string;
  parentHierarchyPath?: string;
  hierarchyDepth?: number;
  matchedFilters?: string[];
  retrieverMetadata?: Record<string, JsonValue>;
  /** 压缩是否改写了 chunk.content；原文在 originalContent。 */
  compressed?: boolean;
  /** 进入压缩前的正文；未压缩时不写。 */
  originalContent?: string;
};
