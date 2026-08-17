import assert from "node:assert/strict";

import type { Chunk } from "../../packages/core/dist/index.js";
import type { IndexingResult } from "../../packages/indexing/dist/index.js";
import type { RuntimeResult } from "../../packages/runtime/dist/index.js";

type IndexedChunkMap = Map<string, Chunk>;

export type IndexingRuntimeQueryScenarioResult = {
  indexingResult: IndexingResult;
  runtimeResult: RuntimeResult;
  indexedChunks: IndexedChunkMap;
  storedVectors: Array<{
    id: string;
    values: number[];
    metadata?: Record<string, unknown>;
  }>;
  lastWriteContext?: {
    documentId?: string;
    chunkIds?: string[];
    mode?: string;
    sourceId?: string;
    fingerprint?: string;
  };
};

export async function runIndexingRuntimeQueryScenario(): Promise<IndexingRuntimeQueryScenarioResult> {
  const {
    BasicMetadataExtractor,
    MemoryVectorStore,
    MockEmbedder,
    SimpleChunker,
    runIndexing,
  } = await import("../../packages/indexing/dist/index.js");
  const {
    createDefaultRuntime,
    createIndexingRetrievalCandidate,
    createIndexingRetrievalRequest,
    filterRetrievalCandidatesByIndexingFilters,
  } = await import("../../packages/runtime/dist/index.js");

  const indexedChunks: IndexedChunkMap = new Map();
  const store = new MemoryVectorStore();
  const embedder = new MockEmbedder({ dimension: 6 });

  const indexingResult = await runIndexing({
    loader: {
      async load() {
        return [
          {
            id: "doc-runtime-api",
            content: "Runtime API section explains the online query pipeline.",
            metadata: {
              title: "Runtime API",
              headerPath: ["runtime", "api"],
            },
          },
          {
            id: "doc-runtime-faq",
            content: "Runtime FAQ section explains common retrieval issues.",
            metadata: {
              title: "Runtime FAQ",
              headerPath: ["runtime", "faq"],
            },
          },
        ];
      },
    },
    mode: "incremental",
    sourceIdResolver() {
      return "docs/runtime";
    },
    fingerprintResolver(document) {
      return `fp:${document.id}`;
    },
    chunker: new SimpleChunker({ chunkSize: 200, overlap: 0 }),
    metadataExtractors: [new BasicMetadataExtractor()],
    embedder: {
      async embed(chunks) {
        for (const chunk of chunks) {
          indexedChunks.set(chunk.id, chunk);
        }

        return embedder.embed(chunks);
      },
    },
    store,
  });

  const runtime = createDefaultRuntime({
    preprocessor: {
      async preprocess(input) {
        return createIndexingRetrievalRequest({
          originalQuery: { query: input.query },
          effectiveQuery: { query: `${input.query} site:docs/runtime` },
          route: "indexed-docs",
          strategy: "metadata-first",
          indexingMode: "incremental",
          budget: {
            maxChunks: 1,
            maxPromptChars: 200,
          },
          rerank: {
            strategy: "score-threshold",
            minScore: 0.5,
          },
          filters: {
            sourceIds: ["docs/runtime"],
            hierarchyPath: ["runtime", "api"],
            metadata: {
              documentTitle: "Runtime API",
              indexingMode: "incremental",
            },
          },
        });
      },
    },
    retriever: {
      async retrieve(request) {
        const candidates = store.getAll().map((vector) => {
          const indexedChunk = indexedChunks.get(vector.id);

          if (!indexedChunk) {
            throw new Error(`missing indexed chunk for vector ${vector.id}`);
          }

          return createIndexingRetrievalCandidate(
            {
              id: indexedChunk.id,
              content: indexedChunk.content,
              metadata: vector.metadata,
            },
            {
              score: vector.id === "doc-runtime-api#0" ? 0.93 : 0.31,
              route: request.route,
              strategy: request.strategy,
              filters: request.filters,
              retrieverMetadata: {
                vectorDimension: vector.values.length,
              },
            },
          );
        });

        const filteredCandidates = filterRetrievalCandidatesByIndexingFilters(
          candidates,
          request.filters,
        );

        return {
          candidates: filteredCandidates,
          retrievalMetadata: {
            indexedDocuments: indexingResult.documentsIndexed,
            indexedVectors: store.size(),
            ...(request.indexingMode
              ? { indexingMode: request.indexingMode }
              : {}),
          },
        };
      },
    },
    generator: {
      async generate({ request, chunks, promptContext }) {
        return {
          answer: [
            request.indexingMode,
            request.effectiveQuery.query,
            promptContext,
          ]
            .filter((value): value is string => typeof value === "string")
            .join("\n---\n"),
          generationMetadata: {
            chunkIds: chunks.map((chunk) => chunk.id),
          },
        };
      },
    },
  });

  const runtimeResult = await runtime.run(
    {
      query: "Explain runtime metadata flow",
    },
    {
      includeDebug: true,
    },
  );

  return {
    indexingResult,
    runtimeResult,
    indexedChunks,
    storedVectors: store.getAll(),
    lastWriteContext: store.getLastWriteContext(),
  };
}

export function assertIndexingRuntimeQueryScenario(
  scenario: IndexingRuntimeQueryScenarioResult,
): void {
  const {
    indexingResult,
    runtimeResult,
    indexedChunks,
    storedVectors,
    lastWriteContext,
  } = scenario;

  assert.equal(indexingResult.documentsTotal, 2);
  assert.equal(indexingResult.documentsIndexed, 2);
  assert.equal(indexingResult.failedDocuments, 0);
  assert.equal(indexingResult.chunksTotal, 2);
  assert.equal(indexingResult.vectorsTotal, 2);

  assert.equal(indexedChunks.size, 2);
  assert.equal(storedVectors.length, 2);
  assert.deepEqual(lastWriteContext, {
    documentId: "doc-runtime-faq",
    chunkIds: ["doc-runtime-faq#0"],
    mode: "incremental",
    sourceId: "docs/runtime",
    fingerprint: "fp:doc-runtime-faq",
  });

  const runtimeApiVector = storedVectors.find(
    (vector) => vector.id === "doc-runtime-api#0",
  );
  const runtimeFaqVector = storedVectors.find(
    (vector) => vector.id === "doc-runtime-faq#0",
  );
  const runtimeApiChunk = indexedChunks.get("doc-runtime-api#0");
  const runtimeFaqChunk = indexedChunks.get("doc-runtime-faq#0");

  assert.ok(runtimeApiVector);
  assert.ok(runtimeFaqVector);
  assert.ok(runtimeApiChunk);
  assert.ok(runtimeFaqChunk);
  assert.equal(runtimeApiVector?.metadata?.documentId, "doc-runtime-api");
  assert.equal(runtimeApiVector?.metadata?.documentTitle, "Runtime API");
  assert.equal(runtimeApiVector?.metadata?.chunkId, "doc-runtime-api#0");
  assert.equal(
    runtimeApiVector?.metadata?.chunkLength,
    runtimeApiChunk?.content.length,
  );
  assert.equal(runtimeApiVector?.metadata?.chunkIndex, 0);
  assert.equal(runtimeApiVector?.metadata?.start, 0);
  assert.equal(
    runtimeApiVector?.metadata?.end,
    runtimeApiChunk?.content.length,
  );
  assert.equal(runtimeApiVector?.metadata?.sourceDocumentId, "doc-runtime-api");
  assert.equal(runtimeApiVector?.metadata?.indexingMode, "incremental");
  assert.equal(runtimeApiVector?.metadata?.sourceId, "docs/runtime");
  assert.equal(runtimeApiVector?.metadata?.fingerprint, "fp:doc-runtime-api");
  assert.deepEqual(runtimeApiVector?.metadata?.hierarchyPath, [
    "runtime",
    "api",
  ]);
  assert.equal(runtimeApiVector?.metadata?.hierarchyDepth, 2);
  assert.deepEqual(runtimeApiVector?.metadata?.parentHierarchyPath, [
    "runtime",
  ]);
  assert.deepEqual(runtimeApiVector?.metadata?.headerPath, ["runtime", "api"]);
  assert.equal(runtimeApiVector?.metadata?.title, "Runtime API");

  assert.equal(runtimeFaqVector?.metadata?.documentId, "doc-runtime-faq");
  assert.equal(runtimeFaqVector?.metadata?.documentTitle, "Runtime FAQ");
  assert.equal(runtimeFaqVector?.metadata?.chunkId, "doc-runtime-faq#0");
  assert.equal(
    runtimeFaqVector?.metadata?.chunkLength,
    runtimeFaqChunk?.content.length,
  );
  assert.equal(runtimeFaqVector?.metadata?.chunkIndex, 0);
  assert.equal(runtimeFaqVector?.metadata?.start, 0);
  assert.equal(
    runtimeFaqVector?.metadata?.end,
    runtimeFaqChunk?.content.length,
  );
  assert.equal(runtimeFaqVector?.metadata?.sourceDocumentId, "doc-runtime-faq");
  assert.equal(runtimeFaqVector?.metadata?.indexingMode, "incremental");
  assert.equal(runtimeFaqVector?.metadata?.sourceId, "docs/runtime");
  assert.equal(runtimeFaqVector?.metadata?.fingerprint, "fp:doc-runtime-faq");
  assert.deepEqual(runtimeFaqVector?.metadata?.hierarchyPath, [
    "runtime",
    "faq",
  ]);
  assert.equal(runtimeFaqVector?.metadata?.hierarchyDepth, 2);
  assert.deepEqual(runtimeFaqVector?.metadata?.parentHierarchyPath, [
    "runtime",
  ]);
  assert.deepEqual(runtimeFaqVector?.metadata?.headerPath, ["runtime", "faq"]);
  assert.equal(runtimeFaqVector?.metadata?.title, "Runtime FAQ");

  assert.equal(
    runtimeResult.originalQuery.query,
    "Explain runtime metadata flow",
  );
  assert.equal(
    runtimeResult.effectiveQuery.query,
    "Explain runtime metadata flow site:docs/runtime",
  );
  assert.equal(runtimeResult.retrievalMetadata?.indexedDocuments, 2);
  assert.equal(runtimeResult.retrievalMetadata?.indexedVectors, 2);
  assert.equal(runtimeResult.retrievalMetadata?.indexingMode, "incremental");
  assert.deepEqual(runtimeResult.generationMetadata?.chunkIds, [
    "doc-runtime-api#0",
  ]);
  assert.equal(runtimeResult.chunks.length, 1);
  assert.equal(runtimeResult.chunks[0]?.id, "doc-runtime-api#0");
  assert.equal(
    runtimeResult.chunks[0]?.metadata?.fingerprint,
    "fp:doc-runtime-api",
  );
  assert.ok(
    runtimeResult.answer.includes(
      "Explain runtime metadata flow site:docs/runtime",
    ),
  );
  assert.ok(
    runtimeResult.answer.includes(
      "Runtime API section explains the online query pipeline.",
    ),
  );

  assert.ok(runtimeResult.debug);
  assert.equal(runtimeResult.debug?.route, "indexed-docs");
  assert.equal(runtimeResult.debug?.retrievalStrategy, "metadata-first");
  assert.equal(runtimeResult.debug?.rerankStrategy, "score-threshold");
  assert.equal(runtimeResult.debug?.indexingMode, "incremental");
  assert.deepEqual(runtimeResult.debug?.filters?.sourceIds, ["docs/runtime"]);
  assert.deepEqual(runtimeResult.debug?.filters?.hierarchyPaths, [
    "runtime/api",
  ]);
  assert.deepEqual(runtimeResult.debug?.filters?.metadata, {
    documentTitle: "Runtime API",
    indexingMode: "incremental",
  });
  assert.equal(runtimeResult.debug?.retrievedCount, 1);
  assert.equal(runtimeResult.debug?.selectedCount, 1);
  assert.equal(runtimeResult.debug?.droppedCount, 0);
  assert.equal(runtimeResult.debug?.finalChunkCount, 1);
  assert.deepEqual(runtimeResult.debug?.appliedBudget, {
    maxChunks: 1,
    maxPromptChars: 200,
  });
  assert.equal(runtimeResult.debug?.appliedScoreThreshold, 0.5);
  assert.equal(runtimeResult.debug?.selectionTrace?.length, 1);
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.chunk.id,
    "doc-runtime-api#0",
  );
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.chunk.content,
    "Runtime API section explains the online query pipeline.",
  );
  assert.deepEqual(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.chunk.metadata,
    runtimeApiVector?.metadata,
  );
  assert.equal(runtimeResult.debug?.selectionTrace?.[0]?.candidate.score, 0.93);
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.route,
    "indexed-docs",
  );
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.strategy,
    "metadata-first",
  );
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.sourceId,
    "docs/runtime",
  );
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.fingerprint,
    "fp:doc-runtime-api",
  );
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.hierarchyPath,
    "runtime/api",
  );
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.parentHierarchyPath,
    "runtime",
  );
  assert.equal(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.hierarchyDepth,
    2,
  );
  assert.deepEqual(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.matchedFilters,
    ["sourceIds", "hierarchyPaths", "metadata"],
  );
  assert.deepEqual(
    runtimeResult.debug?.selectionTrace?.[0]?.candidate.retrieverMetadata,
    {
      vectorDimension: 6,
    },
  );
  assert.equal(
    runtimeResult.debug?.promptContext,
    "query: Explain runtime metadata flow site:docs/runtime\n\nRuntime API section explains the online query pipeline.",
  );
}
