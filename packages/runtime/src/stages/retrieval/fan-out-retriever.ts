import type { Query } from '@monai-ragsdk/core';

import type { RuntimeRetriever, RuntimeRetrieverCapabilities } from './runtime-retriever.js';
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
  /** 路由 targets 用的稳定键；缺省无法被点名选中。 */
  id?: string;
  name?: string;
  capabilities?: RuntimeRetrieverCapabilities;
  retriever: RuntimeRetriever;
  retrievers?: RuntimeRetriever[];
  fuse?: (rankedLists: RetrievalCandidate[][], request: RetrievalRequest) => RetrievalCandidate[];
  maxConcurrency?: number;
  rrf?: FuseByReciprocalRankFusionOptions;
};

type RetrieverSelection =
  | { skipped: true; reason: 'retrieval-mode-skip' | 'targets-empty' | 'targets-unmatched' }
  | { skipped: false; retrievers: RuntimeRetriever[]; targetFiltered: boolean };

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
 * routeDecision.targets / skip 在这里消费：空目标或 skip 不得回退到 retrievers[0]，
 * 否则「主动不检索」会被观测成库空。
 */
export class FanOutRetriever implements RuntimeRetriever {
  readonly id?: string;
  readonly name?: string;
  readonly capabilities?: RuntimeRetrieverCapabilities;
  readonly #retrievers: RuntimeRetriever[];
  readonly #fuse: FanOutRetrieverOptions['fuse'];
  readonly #maxConcurrency: number;
  readonly #rrf: FuseByReciprocalRankFusionOptions | undefined;

  constructor(options: FanOutRetrieverOptions) {
    this.#retrievers = options.retrievers ?? [options.retriever];
    this.#fuse = options.fuse;
    this.#maxConcurrency = options.maxConcurrency ?? 4;
    this.#rrf = options.rrf;
    this.id = options.id;
    this.name = options.name ?? 'fan-out';
    this.capabilities = options.capabilities ?? mergeRetrieverCapabilities(this.#retrievers);
  }

  async close(): Promise<void> {
    await Promise.all(this.#retrievers.map((retriever) => retriever.close?.()));
  }

  async retrieve(
    request: RetrievalRequest,
    context: RuntimeContext,
  ): Promise<RuntimeRetrievalResult> {
    const selection = selectRetrievers(this.#retrievers, request);
    if (selection.skipped) {
      await emitSkipObservation(context, request, selection.reason);
      return {
        candidates: [],
        retrievalMetadata: {
          provider: 'fan-out',
          skipped: true,
          skipReason: selection.reason,
          retrieverCount: 0,
        },
      };
    }

    const subQueries = resolveSubQueries(request);
    const isSingleQuery = subQueries.length === 1 && subQueries[0] === request.effectiveQuery;
    // 无 targets 时保持历史：单查询只打 [0]，避免无意把多库全部召回。
    const retrievers =
      isSingleQuery && !selection.targetFiltered
        ? [selection.retrievers[0]!]
        : selection.retrievers;

    if (isSingleQuery && retrievers.length === 1) {
      return retrievers[0]!.retrieve(request, context);
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
            retrievers.map((retriever) => retriever.retrieve(subRequest, context)),
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
          candidates: summarizeCandidates(ranked.candidates),
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
        candidates: summarizeCandidates(fusedCandidates),
      }),
    });

    return {
      candidates: fusedCandidates,
      retrievalMetadata: {
        provider: 'fan-out',
        subQueryCount: subQueries.length,
        retrieverCount: retrievers.length,
        fusedCandidateCount: fusedCandidates.length,
      },
    };
  }
}

function selectRetrievers(
  retrievers: RuntimeRetriever[],
  request: RetrievalRequest,
): RetrieverSelection {
  const decision = request.routeDecision;
  if (decision?.retrievalMode === 'skip') {
    return { skipped: true, reason: 'retrieval-mode-skip' };
  }

  if (decision?.targets && decision.targets.length === 0) {
    return { skipped: true, reason: 'targets-empty' };
  }

  if (decision?.targets && decision.targets.length > 0) {
    const matched: RuntimeRetriever[] = [];
    const seen = new Set<RuntimeRetriever>();
    for (const target of decision.targets) {
      const retriever = retrievers.find((candidate) => candidate.id === target);
      if (retriever && !seen.has(retriever)) {
        seen.add(retriever);
        matched.push(retriever);
      }
    }

    if (matched.length === 0) {
      return { skipped: true, reason: 'targets-unmatched' };
    }

    return { skipped: false, retrievers: matched, targetFiltered: true };
  }

  return { skipped: false, retrievers, targetFiltered: false };
}

async function emitSkipObservation(
  context: RuntimeContext,
  request: RetrievalRequest,
  reason: 'retrieval-mode-skip' | 'targets-empty' | 'targets-unmatched',
): Promise<void> {
  await emitRuntimeObservation(context, {
    stage: 'retrieval_fanout',
    action: 'complete',
    timestamp: Date.now(),
    attributes: buildObservationAttributes({
      outcome: 'skipped',
      input: {
        query: request.effectiveQuery.query,
        skipReason: reason,
      },
      counts: { candidates: 0, retrievers: 0 },
    }),
  });
}

function mergeRetrieverCapabilities(
  retrievers: RuntimeRetriever[],
): RuntimeRetrieverCapabilities | undefined {
  const searchTypes = [
    ...new Set(retrievers.flatMap((retriever) => retriever.capabilities?.searchTypes ?? [])),
  ];
  return searchTypes.length > 0 ? { searchTypes } : undefined;
}
