import type {
  PostRetrievalResult,
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
} from '../../types/index.js';

export interface RetrievalPostprocessor {
  postprocess(
    input: {
      request: RetrievalRequest;
      candidates: RetrievalCandidate[];
    },
    context: RuntimeContext,
  ): Promise<PostRetrievalResult>;
}
