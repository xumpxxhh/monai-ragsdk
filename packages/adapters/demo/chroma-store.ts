import path from "node:path";
import { fileURLToPath } from "node:url";

import { MockEmbedder, runIndexing } from "@monai-ragsdk/indexing";

import {
  ChromaVectorStoreAdapter,
  LangChainMarkdownDirectoryLoader,
  LangChainRecursiveCharacterTextSplitterAdapter,
} from "../src/index.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const fixtureDirectory = path.join(currentDirectory, "fixtures");
const chromaPort = Number(process.env.CHROMA_PORT ?? 8000);
const collectionName =
  process.env.CHROMA_COLLECTION_NAME ?? "monai-ragsdk-chroma-demo";

const loader = new LangChainMarkdownDirectoryLoader({
  path: fixtureDirectory,
  idPrefix: "demo-doc",
});

const chunker = new LangChainRecursiveCharacterTextSplitterAdapter({
  chunkSize: 32,
  chunkOverlap: 8,
});

const store = new ChromaVectorStoreAdapter({
  host: process.env.CHROMA_HOST ?? "localhost",
  port: Number.isNaN(chromaPort) ? 8000 : chromaPort,
  ssl: process.env.CHROMA_SSL === "true",
  tenant: process.env.CHROMA_TENANT,
  database: process.env.CHROMA_DATABASE,
  collectionName,
});

const result = await runIndexing({
  loader,
  chunker,
  embedder: new MockEmbedder({ dimension: 6 }),
  store,
});

console.log(
  JSON.stringify(
    {
      result,
      chroma: {
        host: process.env.CHROMA_HOST ?? "localhost",
        port: Number.isNaN(chromaPort) ? 8000 : chromaPort,
        collectionName,
      },
    },
    null,
    2,
  ),
);