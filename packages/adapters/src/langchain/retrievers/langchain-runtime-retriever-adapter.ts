import type { Chunk, JsonValue } from "@monai-ragsdk/core";
import {
  createIndexingRetrievalCandidate,
  filterRetrievalCandidatesByIndexingFilters,
} from "@monai-ragsdk/runtime";
import type {
  RetrievalCandidate,
  RetrievalRequest,
  RuntimeContext,
  RuntimeRetrievalResult,
  RuntimeRetriever,
} from "@monai-ragsdk/runtime";

import { normalizeJsonObject } from "../../shared/json.js";

type MaybePromise<T> = T | Promise<T>;

export type LangChainRuntimeRetrieverDocumentLike = {
  pageContent: string;
  metadata?: Record<string, unknown>;
  id?: string;
  score?: number;
};

export type LangChainRuntimeRetrieverLike<
  TInput = string,
  TResult = LangChainRuntimeRetrieverDocumentLike[],
> = {
  invoke(input: TInput): Promise<TResult>;
};

export type LangChainRuntimeRetrieverRequestMapper<TInput> = (
  request: RetrievalRequest,
  context: RuntimeContext,
) => MaybePromise<TInput>;

export type LangChainRuntimeRetrieverCandidateMapper<TResult> = (input: {
  document: LangChainRuntimeRetrieverDocumentLike;
  index: number;
  result: TResult;
  request: RetrievalRequest;
  context: RuntimeContext;
}) => MaybePromise<RetrievalCandidate>;

export type LangChainRuntimeRetrieverMetadataBuilder<TResult> = (input: {
  result: TResult;
  request: RetrievalRequest;
  context: RuntimeContext;
  candidates: RetrievalCandidate[];
  filteredCandidates: RetrievalCandidate[];
}) => MaybePromise<Record<string, JsonValue> | undefined>;

export type LangChainRuntimeRetrieverOptions<
  TInput = string,
  TResult = LangChainRuntimeRetrieverDocumentLike[],
> = {
  retriever: LangChainRuntimeRetrieverLike<TInput, TResult>;
  idPrefix?: string;
  mapRequest?: LangChainRuntimeRetrieverRequestMapper<TInput>;
  extractDocuments?: (
    result: TResult,
    request: RetrievalRequest,
    context: RuntimeContext,
  ) => MaybePromise<LangChainRuntimeRetrieverDocumentLike[]>;
  extractScore?: (
    document: LangChainRuntimeRetrieverDocumentLike,
    index: number,
    request: RetrievalRequest,
  ) => MaybePromise<number | undefined>;
  mapCandidate?: LangChainRuntimeRetrieverCandidateMapper<TResult>;
  buildRetrievalMetadata?: LangChainRuntimeRetrieverMetadataBuilder<TResult>;
  filterByRequest?: boolean;
};

const DEFAULT_ID_PREFIX = "langchain-retrieved-chunk";

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function toRagChunk(
  document: LangChainRuntimeRetrieverDocumentLike,
  index: number,
  idPrefix: string,
): Chunk {
  return {
    id: document.id ?? `${idPrefix}-${index}`,
    content: document.pageContent,
    metadata: normalizeJsonObject(document.metadata),
  };
}

function defaultExtractDocuments(
  result: unknown,
): LangChainRuntimeRetrieverDocumentLike[] {
  if (!Array.isArray(result)) {
    throw new Error(
      "LangChainRuntimeRetrieverAdapter expected retriever result to be an array. Provide extractDocuments() to customize result parsing.",
    );
  }

  return result.filter(
    (document): document is LangChainRuntimeRetrieverDocumentLike =>
      typeof document === "object" &&
      document !== null &&
      "pageContent" in document &&
      typeof document.pageContent === "string",
  );
}

export class LangChainRuntimeRetrieverAdapter<
  TInput = string,
  TResult = LangChainRuntimeRetrieverDocumentLike[],
> implements RuntimeRetriever {
  readonly #retriever: LangChainRuntimeRetrieverLike<TInput, TResult>;
  readonly #idPrefix: string;
  readonly #options: LangChainRuntimeRetrieverOptions<TInput, TResult>;

  constructor(options: LangChainRuntimeRetrieverOptions<TInput, TResult>) {
    this.#retriever = options.retriever;
    this.#idPrefix = options.idPrefix ?? DEFAULT_ID_PREFIX;
    this.#options = options;
  }

  async retrieve(
    request: RetrievalRequest,
    context: RuntimeContext,
  ): Promise<RuntimeRetrievalResult> {
    const retrieverInput = this.#options.mapRequest
      ? await this.#options.mapRequest(request, context)
      : (request.effectiveQuery.query as TInput);
    const result = await this.#retriever.invoke(retrieverInput);
    const documents = this.#options.extractDocuments
      ? await this.#options.extractDocuments(result, request, context)
      : defaultExtractDocuments(result);

    const candidates = await Promise.all(
      documents.map(async (document, index) => {
        if (this.#options.mapCandidate) {
          return this.#options.mapCandidate({
            document,
            index,
            result,
            request,
            context,
          });
        }

        const score = this.#options.extractScore
          ? await this.#options.extractScore(document, index, request)
          : (readNumber(document.score) ??
            readNumber(document.metadata?.score));

        return createIndexingRetrievalCandidate(
          toRagChunk(document, index, this.#idPrefix),
          {
            score,
            route: request.route,
            strategy: request.strategy,
          },
        );
      }),
    );

    const filteredCandidates =
      this.#options.filterByRequest === false
        ? candidates
        : filterRetrievalCandidatesByIndexingFilters(
            candidates,
            request.filters,
          );
    const retrievalMetadata = this.#options.buildRetrievalMetadata
      ? await this.#options.buildRetrievalMetadata({
          result,
          request,
          context,
          candidates,
          filteredCandidates,
        })
      : undefined;

    return {
      candidates: filteredCandidates,
      retrievalMetadata,
    };
  }
}
