import type { Chunk } from "@monai-ragsdk/core";
import { MockEmbedder } from "@monai-ragsdk/indexing";
import type { RAGObserver } from "@monai-ragsdk/observability";
import {
  NoopQueryPreprocessor,
  createDefaultRuntime,
  type RetrievalRequest,
  type RuntimeRetriever,
  type RuntimeContext,
  type RuntimeGenerationResult,
  type RuntimeRetrievalResult,
  type RuntimeResult,
} from "@monai-ragsdk/runtime";

import type { CliConfig } from "../../config/schema.js";
import { buildAnswer } from "./output.js";
import { createEmbedder } from "../providers/embedder.js";
import { createPgVectorRuntimeRetriever } from "../providers/retriever.js";
import { retrieveRankedChunks } from "./retrieval.js";
import { createChunkMapFromSnapshot } from "../indexing/snapshot.js";
import type { IndexSnapshot } from "../../types.js";

export async function runRuntimeFromSnapshot(input: {
  snapshot: IndexSnapshot;
  query: string;
  topK: number;
  debug: boolean;
  observer: RAGObserver;
  command: "ask" | "runtime";
}): Promise<RuntimeResult> {
  const chunkMap = createChunkMapFromSnapshot(input.snapshot);
  const embedder = new MockEmbedder({
    dimension: input.snapshot.embeddingDimension,
  });
  const runtime = createDefaultRuntime({
    observer: input.observer,
    preprocessor: new NoopQueryPreprocessor({
      route: "app-cli",
      strategy: "vector-search",
      budget: {
        maxChunks: input.topK,
      },
    }),
    retriever: {
      async retrieve(request) {
        return retrieveRankedChunks({
          embedder,
          request,
          topK: input.topK,
          vectors: input.snapshot.vectors,
          chunkMap,
        });
      },
    },
    generator: {
      async generate({
        chunks,
        request,
      }: {
        chunks: Chunk[];
        request: RetrievalRequest;
      }): Promise<RuntimeGenerationResult> {
        return {
          answer: buildAnswer({
            chunks,
            query: request.effectiveQuery.query,
          }),
          generationMetadata: {
            chunkIds: chunks.map((chunk: Chunk) => chunk.id),
          },
        };
      },
    },
  });

  return runtime.run(
    {
      query: input.query,
    },
    {
      includeDebug: input.debug,
      trace: {
        traceId: `app-cli-${input.command}-${Date.now()}`,
        tags: {
          command: input.command,
        },
      },
    },
  );
}

export async function runRuntimeFromConfiguredStore(input: {
  config: CliConfig;
  query: string;
  topK: number;
  debug: boolean;
  observer: RAGObserver;
  command: "ask" | "runtime";
}): Promise<RuntimeResult> {
  const retriever = createConfiguredRetriever(input.config);

  return runRuntimeWithRetriever({
    retriever,
    query: input.query,
    topK: input.topK,
    debug: input.debug,
    observer: input.observer,
    command: input.command,
  });
}

export async function runRetrievalFromSnapshot(input: {
  snapshot: IndexSnapshot;
  query: string;
  topK: number;
}): Promise<RuntimeRetrievalResult> {
  const chunkMap = createChunkMapFromSnapshot(input.snapshot);
  const embedder = new MockEmbedder({
    dimension: input.snapshot.embeddingDimension,
  });
  const preprocessor = new NoopQueryPreprocessor({
    route: "app-cli",
    strategy: "vector-search",
    budget: {
      maxChunks: input.topK,
    },
  });
  const request = await preprocessor.preprocess(
    {
      query: input.query,
    },
    createRuntimeContext(input.query),
  );

  return retrieveRankedChunks({
    embedder,
    request,
    topK: input.topK,
    vectors: input.snapshot.vectors,
    chunkMap,
  });
}

export async function runRetrievalFromConfiguredStore(input: {
  config: CliConfig;
  query: string;
  topK: number;
}): Promise<RuntimeRetrievalResult> {
  const retriever = createConfiguredRetriever(input.config);
  const preprocessor = new NoopQueryPreprocessor({
    route: "app-cli",
    strategy: "vector-search",
    budget: {
      maxChunks: input.topK,
    },
  });
  const request = await preprocessor.preprocess(
    {
      query: input.query,
    },
    createRuntimeContext(input.query),
  );

  return retriever.retrieve(request, createRuntimeContext(input.query));
}

async function runRuntimeWithRetriever(input: {
  retriever: RuntimeRetriever;
  query: string;
  topK: number;
  debug: boolean;
  observer: RAGObserver;
  command: "ask" | "runtime";
}): Promise<RuntimeResult> {
  const runtime = createDefaultRuntime({
    observer: input.observer,
    preprocessor: new NoopQueryPreprocessor({
      route: "app-cli",
      strategy: "vector-search",
      budget: {
        maxChunks: input.topK,
      },
    }),
    retriever: input.retriever,
    generator: {
      async generate({
        chunks,
        request,
      }: {
        chunks: Chunk[];
        request: RetrievalRequest;
      }): Promise<RuntimeGenerationResult> {
        return {
          answer: buildAnswer({
            chunks,
            query: request.effectiveQuery.query,
          }),
          generationMetadata: {
            chunkIds: chunks.map((chunk: Chunk) => chunk.id),
          },
        };
      },
    },
  });

  return runtime.run(
    {
      query: input.query,
    },
    {
      includeDebug: input.debug,
      trace: {
        traceId: `app-cli-${input.command}-${Date.now()}`,
        tags: {
          command: input.command,
        },
      },
    },
  );
}

function createConfiguredRetriever(config: CliConfig): RuntimeRetriever {
  if (config.vectorStore.provider !== "pgvector") {
    throw new Error("configured runtime store is not retrievable");
  }

  return createPgVectorRuntimeRetriever({
    config: config.vectorStore,
    embedder: createEmbedder(config.embedding),
  });
}

function createRuntimeContext(query: string): RuntimeContext {
  const startedAt = Date.now();

  return {
    requestId: `retrieval-debug-${startedAt}`,
    input: {
      query,
    },
    options: {},
    startedAt,
  };
}
