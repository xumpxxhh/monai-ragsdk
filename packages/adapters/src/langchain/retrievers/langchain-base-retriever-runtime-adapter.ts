import type { DocumentInterface } from "@langchain/core/documents";
import type { BaseRetriever } from "@langchain/core/retrievers";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { RetrievalRequest, RuntimeContext } from "@monai-ragsdk/runtime";

import {
  LangChainRuntimeRetrieverAdapter,
  type LangChainRuntimeRetrieverMetadataBuilder,
} from "./langchain-runtime-retriever-adapter.js";

type MaybePromise<T> = T | Promise<T>;

type RetrieverInvokeInput = {
  query: string;
  config?: RunnableConfig;
};

export type CreateLangChainBaseRetrieverRuntimeAdapterOptions<
  Metadata extends Record<string, any> = Record<string, any>,
> = {
  retriever: BaseRetriever<Metadata>;
  idPrefix?: string;
  mapQuery?: (
    request: RetrievalRequest,
    context: RuntimeContext,
  ) => MaybePromise<string>;
  mapRunnableConfig?: (
    request: RetrievalRequest,
    context: RuntimeContext,
  ) => MaybePromise<RunnableConfig | undefined>;
  extractScore?: (
    document: DocumentInterface<Metadata>,
    index: number,
    request: RetrievalRequest,
  ) => MaybePromise<number | undefined>;
  buildRetrievalMetadata?: LangChainRuntimeRetrieverMetadataBuilder<
    DocumentInterface<Metadata>[]
  >;
  filterByRequest?: boolean;
};

function readScoreFromMetadata(
  document: DocumentInterface<Record<string, any>>,
): number | undefined {
  return typeof document.metadata?.score === "number" &&
    Number.isFinite(document.metadata.score)
    ? document.metadata.score
    : undefined;
}

export function createLangChainBaseRetrieverRuntimeAdapter<
  Metadata extends Record<string, any> = Record<string, any>,
>(
  options: CreateLangChainBaseRetrieverRuntimeAdapterOptions<Metadata>,
): LangChainRuntimeRetrieverAdapter<
  RetrieverInvokeInput,
  DocumentInterface<Metadata>[]
> {
  return new LangChainRuntimeRetrieverAdapter<
    RetrieverInvokeInput,
    DocumentInterface<Metadata>[]
  >({
    retriever: {
      async invoke(input) {
        return options.retriever.invoke(input.query, input.config);
      },
    },
    idPrefix: options.idPrefix,
    async mapRequest(request, context) {
      return {
        query: options.mapQuery
          ? await options.mapQuery(request, context)
          : request.effectiveQuery.query,
        config: options.mapRunnableConfig
          ? await options.mapRunnableConfig(request, context)
          : undefined,
      };
    },
    extractDocuments(result) {
      return result.map((document) => ({
        id: document.id,
        pageContent: document.pageContent,
        metadata: document.metadata,
      }));
    },
    async extractScore(document, index, request) {
      const typedDocument = document as DocumentInterface<Metadata>;

      return options.extractScore
        ? options.extractScore(typedDocument, index, request)
        : readScoreFromMetadata(
            typedDocument as DocumentInterface<Record<string, any>>,
          );
    },
    buildRetrievalMetadata: options.buildRetrievalMetadata,
    filterByRequest: options.filterByRequest,
  });
}
