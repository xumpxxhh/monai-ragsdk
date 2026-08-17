import {
  BasicMetadataExtractor,
  ContentCleanupTransformer,
  ContextualHeaderTransformer,
  HashDedupChunkFilter,
  MemoryVectorStore,
  MockEmbedder,
  runIndexing,
} from "../dist/index.js";

const store = new MemoryVectorStore();

const result = await runIndexing({
  loader: {
    async load() {
      return [
        {
          id: "demo/extensions",
          content:
            "# Overview\n\n## Goals\n\nSDK extension points should stay composable.\n\nSDK extension points should stay composable.",
          metadata: {
            title: "Extension Demo",
            source: "demo",
          },
        },
      ];
    },
  },
  transformers: [new ContentCleanupTransformer()],
  chunkTransformers: [new ContextualHeaderTransformer()],
  chunkFilters: [new HashDedupChunkFilter()],
  metadataExtractors: [new BasicMetadataExtractor()],
  embedder: new MockEmbedder({ dimension: 6 }),
  store,
});

console.log("indexing extension demo passed");
console.log(result);
console.log(store.getAll());
