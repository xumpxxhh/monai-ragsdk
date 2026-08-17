import path from "node:path";

import {
  LangChainDirectoryLoaderAdapter,
  UnknownHandling,
} from "@monai-ragsdk/adapters";
import type { Document } from "@monai-ragsdk/core";
import {
  BasicMetadataExtractor,
  SimpleChunker,
  runIndexing,
} from "@monai-ragsdk/indexing";
import type { DocumentTransformer } from "@monai-ragsdk/indexing";
import type { RAGObserver } from "@monai-ragsdk/observability";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";

import type { CliConfig } from "../../config/schema.js";
import { createEmbedder } from "../providers/embedder.js";
import { createVectorStore } from "../providers/vector-store.js";
import { createTrackingEmbedder } from "../runtime/retrieval.js";
import type {
  IndexBuildOptions,
  IndexSnapshot,
  IndexedChunkMap,
} from "../../types.js";

export async function runLocalIndexing(input: {
  options: IndexBuildOptions;
  config: CliConfig;
  observer: RAGObserver;
  command: "ask" | "index";
}): Promise<IndexSnapshot> {
  const chunkMap: IndexedChunkMap = new Map();
  const embedder = createEmbedder(input.config.embedding);
  const { store, memoryStore } = createVectorStore(
    input.config.vectorStore,
    input.config.embedding.dimension,
  );
  const resolvedDirectoryPath = path.resolve(
    process.cwd(),
    input.options.directoryPath,
  );

  const loader = new LangChainDirectoryLoaderAdapter({
    directoryPath: resolvedDirectoryPath,
    loaders: Object.fromEntries(
      input.options.extensions.map((ext) => [
        ext,
        (filePath: string) => new TextLoader(filePath),
      ]),
    ),
    recursive: true,
    unknown: UnknownHandling.Ignore,
    idPrefix: "doc",
  });

  const headerPathTransformer: DocumentTransformer = {
    async transform(document: Document): Promise<Document> {
      const sourcePath = document.metadata?.source;
      if (typeof sourcePath !== "string") {
        return document;
      }

      const relativePath =
        path.relative(resolvedDirectoryPath, sourcePath) ||
        path.basename(sourcePath);
      const headerPath = relativePath
        .split(path.sep)
        .map((segment) => segment.replace(/\.[^.]+$/, ""))
        .filter((segment) => segment.length > 0);

      return {
        ...document,
        metadata: {
          ...document.metadata,
          title: path.basename(sourcePath),
          relativePath,
          headerPath,
        },
      };
    },
  };

  const indexingResult = await runIndexing({
    loader,
    chunker: new SimpleChunker({
      chunkSize: input.options.chunkSize,
      overlap: input.options.chunkOverlap,
    }),
    transformers: [headerPathTransformer],
    metadataExtractors: [new BasicMetadataExtractor()],
    embedder: createTrackingEmbedder(embedder, chunkMap),
    observer: input.observer,
    trace: {
      dataset: "app-cli",
      version: "v1",
      tags: {
        command: input.command,
        directoryPath: resolvedDirectoryPath,
      },
    },
    store,
  });

  return {
    createdAt: new Date().toISOString(),
    directoryPath: resolvedDirectoryPath,
    indexingResult,
    chunks: Array.from(chunkMap.values()),
    vectors: memoryStore?.getAll() ?? [],
    embeddingDimension: input.config.embedding.dimension,
  };
}
