import type { Query } from '@monai-ragsdk/core';

import type { RuntimeRetriever } from './runtime-retriever.js';
import type {
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
  RuntimeRetrievalResult,
} from '../../types/index.js';

import {
  fuseByReciprocalRankFusion,
  type FuseByReciprocalRankFusionOptions,
} from './fuse-by-rrf.js';

export type FanOutRetrieverOptions = {
  retriever: RuntimeRetriever;
  retrievers?: RuntimeRetriever[];
  fuse?: (rankedLists: RetrievalCandidate[][], request: RetrievalRequest) => RetrievalCandidate[];
  maxConcurrency?: number;
  rrf?: FuseByReciprocalRankFusionOptions;
};

function resolveSubQueries(request: RetrievalRequest): Query[] {
  if (request.subQueries && request.subQueries.length > 0) {
    return request.subQueries;
  }

  return [request.effectiveQuery];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 读 RetrievalRequest.subQueries 对每个子查询 fan-out 检索再融合；
 * 无 subQueries 时退化为单次底层 retrieve，兼容现有 retriever。
 */
export class FanOutRetriever implements RuntimeRetriever {
  readonly #retrievers: RuntimeRetriever[];
  readonly #fuse: FanOutRetrieverOptions['fuse'];
  readonly #maxConcurrency: number;
  readonly #rrf: FuseByReciprocalRankFusionOptions | undefined;

  constructor(options: FanOutRetrieverOptions) {
    this.#retrievers = options.retrievers ?? [options.retriever];
    this.#fuse = options.fuse;
    this.#maxConcurrency = options.maxConcurrency ?? 4;
    this.#rrf = options.rrf;
  }

  async retrieve(
    request: RetrievalRequest,
    context: RuntimeContext,
  ): Promise<RuntimeRetrievalResult> {
    const subQueries = resolveSubQueries(request);
    console.log('###@@@subQueries####\n', subQueries);
    if (subQueries.length === 1 && subQueries[0] === request.effectiveQuery) {
      return this.#retrievers[0]!.retrieve(request, context);
    }

    const rankedLists = await mapWithConcurrency(
      subQueries,
      this.#maxConcurrency,
      async (subQuery) => {
        const subRequest: RetrievalRequest = {
          ...request,
          effectiveQuery: subQuery,
        };
        const results = await Promise.all(
          this.#retrievers.map((retriever) => retriever.retrieve(subRequest, context)),
        );

        return results.flatMap((result) => result.candidates);
      },
    );

    const fusedCandidates = this.#fuse
      ? this.#fuse(rankedLists, request)
      : fuseByReciprocalRankFusion(rankedLists, this.#rrf);

    return {
      candidates: fusedCandidates,
      retrievalMetadata: {
        provider: 'fan-out',
        subQueryCount: subQueries.length,
        retrieverCount: this.#retrievers.length,
        fusedCandidateCount: fusedCandidates.length,
      },
    };
  }
}
