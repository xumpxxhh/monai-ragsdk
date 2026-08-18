import { describe, expect, it } from "vitest";

import type { Chunk, Document, JsonValue } from "@monai-ragsdk/core";
import {
  BasicMetadataExtractor,
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  runIndexing,
  type Embedder,
} from "@monai-ragsdk/indexing";

import {
  createCollection,
  createDefaultRuntime,
  createIndexingRetrievalCandidate,
  filterRetrievalCandidatesByIndexingFilters,
} from "../src/index.ts";

import type { RuntimeRunOptions } from "../src/types/index.js";
import type { CollectionSearchResult } from "../src/collection/create-collection.js";

describe("stage 3 collection facade", () => {
  it("ingest documents then search/ask returns grounding chunks", async () => {
    const indexedChunks = new Map<string, Chunk>();
    let generateCalls = 0;

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

    const documents: Document[] = [
      {
        id: "doc-1",
        content: "hello monai-ragsdk collection",
        metadata: {
          title: "Doc1",
          headerPath: ["collection", "doc-1"],
        },
      },
      {
        id: "doc-2",
        content: "runtime search should return chunks",
        metadata: {
          title: "Doc2",
          headerPath: ["collection", "doc-2"],
        },
      },
    ];

    const indexingOptions = {
      mode: "incremental" as const,
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      metadataExtractors: [new BasicMetadataExtractor()],
      embedder,
      store,
      sourceIdResolver() {
        return "docs/collection";
      },
      fingerprintResolver(document: Document) {
        return `fp:${document.id}`;
      },
    };

    const runtime = createDefaultRuntime({
      retriever: {
        async retrieve(request) {
          // runtime 的检索期不会自动“知道 chunk content”，所以测试里从 indexing 写入的 indexedChunks 映射回 chunk。
          const vectors = store.getAll();

          const candidates = vectors.map((vector) => {
            const indexedChunk = indexedChunks.get(vector.id);
            if (!indexedChunk) {
              throw new Error(`missing indexed chunk for vector: ${vector.id}`);
            }

            return createIndexingRetrievalCandidate(indexedChunk, {
              score: 0.99,
              route: request.route,
              strategy: request.strategy,
              filters: request.filters,
              retrieverMetadata: {
                vectorDimension: vector.values.length,
              },
            });
          });

          const filteredCandidates = filterRetrievalCandidatesByIndexingFilters(
            candidates,
            request.filters,
          );

          return {
            candidates: filteredCandidates,
            retrievalMetadata: {
              vectorsTotal: vectors.length,
            },
          };
        },
      },
      generator: {
        async generate({ request, chunks }) {
          generateCalls += 1;
          return {
            answer: `answer:${request.effectiveQuery.query}:${chunks
              .map((chunk) => chunk.id)
              .join(",")}`,
          };
        },
      },
    });

    const collection = createCollection({
      indexing: indexingOptions,
      runtime,
    });

    const ingestResult = await collection.ingest(documents);
    expect(ingestResult.documentsIndexed).toBe(2);
    expect(ingestResult.vectorsTotal).toBeGreaterThan(0);
    expect(store.getAll().length).toBeGreaterThan(0);
    expect(indexedChunks.size).toBeGreaterThan(0);

    const sources = await collection.listSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((source) => source.sourceId === "docs/collection")).toBe(
      true,
    );

    const runtimeOptions: RuntimeRunOptions = { includeDebug: true };
    const searchResult = (await collection.search(
      { query: "test collection", metadata: { tag: "unit" } },
      runtimeOptions,
    )) satisfies CollectionSearchResult;

    expect(searchResult.chunks.length).toBeGreaterThan(0);
    expect(searchResult.citations.length).toBe(searchResult.chunks.length);
    expect(searchResult.effectiveQuery.query).toBe("test collection");
    expect(searchResult.originalQuery.query).toBe("test collection");
    expect(searchResult).not.toHaveProperty("answer");
    expect(searchResult).not.toHaveProperty("streamed");
    expect(searchResult).not.toHaveProperty("generationMetadata");
    expect(searchResult.timings).not.toHaveProperty("generation");
    expect(generateCalls).toBe(0);

    const askResult = await collection.ask(
      { query: "test ask" },
      runtimeOptions,
    );

    expect(generateCalls).toBe(1);

    expect(askResult.answer).toContain("answer:test ask:");
    expect(askResult.chunks.length).toBeGreaterThan(0);
    expect(askResult.citations.length).toBe(askResult.chunks.length);

    const deleted = await collection.deleteByFilters({
      sourceIds: ["docs/collection"],
    });
    expect(deleted).toBe(true);

    const afterDelete = await collection.search(
      { query: "test after delete" },
      runtimeOptions,
    );
    expect(afterDelete.chunks.length).toBe(0);
    expect(afterDelete.citations.length).toBe(0);
  });
});

