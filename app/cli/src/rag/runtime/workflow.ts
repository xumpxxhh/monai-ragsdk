import { MockEmbedder } from "@monai-ragsdk/indexing";
import type { RAGObserver } from "@monai-ragsdk/observability";
import {
  NoopQueryPreprocessor,
  createDefaultRuntime,
  type RuntimeRetriever,
  type RuntimeContext,
  type RuntimeRetrievalResult,
  type RuntimeResult,
} from "@monai-ragsdk/runtime";

import type { CliConfig } from "../../config/schema.js";
import { createEmbedder } from "../providers/embedder.js";
import { createGenerator } from "../providers/generator.js";
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
  config: CliConfig;
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
    generator: createGenerator(input.config),
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
  return runRuntimeWithRetriever({
    retriever: createConfiguredRetriever(input.config),
    generatorConfig: input.config,
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
  generatorConfig: CliConfig;
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
    generator: createGenerator(input.generatorConfig),
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
