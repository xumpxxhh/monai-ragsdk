/**
 * Retriever / adapter 要实现行为正确的 RuntimeRetriever，应使用这里的工厂与过滤函数，
 * 而不是依赖 runtime 包根上的内部实现。包根只保留编排与策略装配 API。
 */
export {
  createIndexingRetrievalCandidate,
  createIndexingRetrievalFilters,
  createIndexingRetrievalRequest,
  enforceRetrievalRequestFilters,
  filterRetrievalCandidatesByIndexingFilters,
  matchRetrievalCandidateFilters,
  type CreateIndexingRetrievalCandidateOptions,
  type CreateIndexingRetrievalRequestOptions,
  type IndexingRetrievalFilterInput,
  type RetrievalFilterMatchResult,
} from '../indexing/query-protocol.js';

export {
  fuseByReciprocalRankFusion,
  type FuseByReciprocalRankFusionOptions,
} from '../stages/retrieval/fuse-by-rrf.js';
