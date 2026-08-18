import {
  createCollection,
  createDefaultRuntime,
  createIndexingRetrievalCandidate,
  filterRetrievalCandidatesByIndexingFilters,
} from "../dist/index.js";

import {
  BasicMetadataExtractor,
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  type Embedder,
} from "@monai-ragsdk/indexing";

const indexedChunks = new Map<string, any>();

const baseEmbedder = new MockEmbedder({ dimension: 6 });
const embedder: Embedder = {
  async embed(chunks) {
    for (const chunk of chunks) {
      indexedChunks.set(chunk.id, chunk);
    }

    return baseEmbedder.embed(chunks);
  },
};

const store = new MemoryVectorStore();

const collection = createCollection({
  indexing: {
    mode: "incremental",
    chunker: new SimpleChunker({ chunkSize: 60, overlap: 0 }),
    metadataExtractors: [new BasicMetadataExtractor()],
    embedder,
    store,
    sourceIdResolver() {
      return "docs/collection-demo";
    },
    fingerprintResolver(document) {
      return `fp:${document.id}`;
    },
  },
  runtime: createDefaultRuntime({
    retriever: {
      async retrieve(request) {
        const vectors = store.getAll();

        const candidates = vectors.map((vector) => {
          const chunk = indexedChunks.get(vector.id);
          if (!chunk) {
            throw new Error(`missing indexed chunk for vector: ${vector.id}`);
          }

          return createIndexingRetrievalCandidate(chunk, {
            score: 0.99,
            route: request.route,
            strategy: request.strategy,
            filters: request.filters,
          });
        });

        return {
          candidates: filterRetrievalCandidatesByIndexingFilters(
            candidates,
            request.filters,
          ),
          retrievalMetadata: { vectorsTotal: vectors.length },
        };
      },
    },
    generator: {
      async generate({ request, chunks }) {
        return {
          answer: `answer:${request.effectiveQuery.query}:${chunks
            .map((chunk) => chunk.id)
            .join(",")}`,
        };
      },
    },
  }),
});

const documents = [
  {
    id: "doc-1",
    content: "Collection demo：先 ingest 再 search/ask。",
    metadata: { title: "Doc1", headerPath: ["collection", "demo", "doc-1"] },
  },
];

await collection.ingest(documents);

const sources = await collection.listSources();
console.log("collection demo listSources passed", {
  count: sources.length,
  hasSource: sources.some((s) => s.sourceId === "docs/collection-demo"),
});

const searchResult = await collection.search({ query: "demo search" });
console.log("collection demo search passed", {
  chunks: searchResult.chunks.length,
  citations: searchResult.citations.length,
});

const askResult = await collection.ask({ query: "demo ask" });
console.log("collection demo ask passed", {
  answer: askResult.answer,
  chunks: askResult.chunks.length,
  citations: askResult.citations.length,
});

const deleted = await collection.deleteByFilters({
  sourceIds: ["docs/collection-demo"],
});
console.log("collection demo deleteByFilters passed", { deleted });

const afterDelete = await collection.search({ query: "demo after delete" });
console.log("collection demo after delete passed", {
  chunks: afterDelete.chunks.length,
  citations: afterDelete.citations.length,
});

