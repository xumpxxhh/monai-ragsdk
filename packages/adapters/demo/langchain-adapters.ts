import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MemoryVectorStore,
  MockEmbedder,
  runIndexing,
} from "@monai-ragsdk/indexing";

import {
  LangChainMarkdownDirectoryLoader,
  LangChainRecursiveCharacterTextSplitterAdapter,
} from "../src/index.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const fixtureDirectory = path.join(currentDirectory, "fixtures");

const loader = new LangChainMarkdownDirectoryLoader({
  path: fixtureDirectory,
  idPrefix: "demo-doc",
});

const chunker = new LangChainRecursiveCharacterTextSplitterAdapter({
  chunkSize: 32,
  chunkOverlap: 8,
});

const store = new MemoryVectorStore();

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
      vectors: store.getAll(),
    },
    null,
    2,
  ),
);
