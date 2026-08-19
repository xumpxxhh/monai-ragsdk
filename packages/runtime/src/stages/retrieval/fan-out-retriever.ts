import type { Query } from '@monai-ragsdk/core';

import type { RuntimeRetriever } from './runtime-retriever.js';
import type {
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
  RuntimeRetrievalResult,
} from '../../types/index.js';

import {
  buildObservationAttributes,
  emitRuntimeObservation,
  emitRuntimeObservationError,
  summarizeCandidates,
  toObservationError,
} from '../../observation/index.js';
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
 * 真正多路时按 index 顺序打 retrieval_fanout / retrieval_fuse，避免 JSONL 被并发打乱。
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
    if (subQueries.length === 1 && subQueries[0] === request.effectiveQuery) {
      return this.#retrievers[0]!.retrieve(request, context);
    }

    const rankedLists = await mapWithConcurrency(
      subQueries,
      this.#maxConcurrency,
      async (subQuery, subQueryIndex) => {
        const startedAt = Date.now();
        const subRequest: RetrievalRequest = {
          ...request,
          effectiveQuery: subQuery,
        };

        try {
          const results = await Promise.all(
            this.#retrievers.map((retriever) => retriever.retrieve(subRequest, context)),
          );

          return {
            candidates: results.flatMap((result) => result.candidates),
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          const observationError = toObservationError(error);
          const failRecord = {
            stage: 'retrieval_fanout',
            action: 'fail' as const,
            timestamp: Date.now(),
            durationMs: Date.now() - startedAt,
            attributes: buildObservationAttributes({
              outcome: 'failed',
              input: {
                index: subQueryIndex,
                query: subQuery.query,
              },
              error: observationError,
            }),
            error: observationError,
          };

          await emitRuntimeObservation(context, failRecord);
          await emitRuntimeObservationError(context, failRecord);
          throw error;
        }
      },
    );

    for (let subQueryIndex = 0; subQueryIndex < rankedLists.length; subQueryIndex += 1) {
      const ranked = rankedLists[subQueryIndex]!;
      await emitRuntimeObservation(context, {
        stage: 'retrieval_fanout',
        action: 'complete',
        timestamp: Date.now(),
        durationMs: ranked.durationMs,
        attributes: buildObservationAttributes({
          input: {
            index: subQueryIndex,
            query: subQueries[subQueryIndex]!.query,
          },
          counts: { candidates: ranked.candidates.length },
          candidates: summarizeCandidates(ranked.candidates, 'retriever'),
        }),
      });
    }

    const candidateLists = rankedLists.map((ranked) => ranked.candidates);
    const fusedCandidates = this.#fuse
      ? this.#fuse(candidateLists, request)
      : fuseByReciprocalRankFusion(candidateLists, this.#rrf);

    await emitRuntimeObservation(context, {
      stage: 'retrieval_fuse',
      action: 'complete',
      timestamp: Date.now(),
      attributes: buildObservationAttributes({
        counts: {
          subQueries: subQueries.length,
          fused: fusedCandidates.length,
        },
        candidates: summarizeCandidates(fusedCandidates, 'rrf'),
      }),
    });

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
