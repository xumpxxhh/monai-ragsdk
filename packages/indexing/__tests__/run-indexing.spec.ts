import { describe, expect, it, vi } from "vitest";

import {
  IndexingError,
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  runIndexing,
  type Loader,
} from "../src/index.ts";

describe("runIndexing", () => {
  it("runs the minimal indexing flow and collects result stats", async () => {
    const loader: Loader = {
      async load() {
        return [
          {
            id: "doc-1",
            content: "RAG indexing converts markdown into searchable chunks.",
            metadata: { source: "test" },
          },
          {
            id: "doc-2",
            content: "   ",
          },
        ];
      },
    };

    const store = new MemoryVectorStore();

    const result = await runIndexing({
      loader,
      chunker: new SimpleChunker({ chunkSize: 20, overlap: 5 }),
      embedder: new MockEmbedder({ dimension: 5 }),
      store,
    });

    expect(result.documentsTotal).toBe(2);
    expect(result.documentsIndexed).toBe(1);
    expect(result.skippedDocuments).toBe(1);
    expect(result.failedDocuments).toBe(0);
    expect(result.chunksTotal).toBeGreaterThan(0);
    expect(result.vectorsTotal).toBe(result.chunksTotal);
    expect(store.size()).toBe(result.vectorsTotal);
    expect(store.getAll()[0]?.metadata).toMatchObject({
      source: "test",
      documentId: "doc-1",
    });
    expect(typeof store.getAll()[0]?.metadata?.content).toBe("string");
    expect(String(store.getAll()[0]?.metadata?.content).length).toBeGreaterThan(
      0,
    );
  });

  it("continues on document failure when onError is provided", async () => {
    const loader: Loader = {
      async load() {
        return [
          { id: "ok", content: "works" },
          { id: "fail", content: "this document should fail" },
        ];
      },
    };
    const store = new MemoryVectorStore();
    const onError = vi.fn();

    const result = await runIndexing({
      loader,
      chunker: new SimpleChunker({ chunkSize: 50, overlap: 0 }),
      embedder: {
        async embed(chunks) {
          if (chunks.some((chunk) => chunk.id.startsWith("fail#"))) {
            throw new Error("mock embed failure");
          }

          return new MockEmbedder({ dimension: 3 }).embed(chunks);
        },
      },
      store,
      onError,
    });

    expect(result.documentsIndexed).toBe(1);
    expect(result.failedDocuments).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(IndexingError);
    expect(onError.mock.calls[0]?.[1]).toMatchObject({
      documentId: "fail",
      stage: "embed",
      mode: "full",
    });
  });

  it("throws an IndexingError when no onError handler is provided", async () => {
    const loader: Loader = {
      async load() {
        return [{ id: "fail", content: "boom" }];
      },
    };

    await expect(
      runIndexing({
        loader,
        chunker: new SimpleChunker({ chunkSize: 10, overlap: 0 }),
        embedder: {
          async embed() {
            throw new Error("embedding failed");
          },
        },
        store: new MemoryVectorStore(),
      }),
    ).rejects.toMatchObject({
      name: "IndexingError",
      stage: "embed",
    });
  });

  it("applies chunk transformers, metadata extractors, and chunk filters", async () => {
    const loader: Loader = {
      async load() {
        return [
          {
            id: "doc-extensions",
            content: "Alpha Beta Gamma Delta",
            metadata: { source: "extensions" },
          },
        ];
      },
    };

    const store = new MemoryVectorStore();

    const result = await runIndexing({
      loader,
      chunker: new SimpleChunker({ chunkSize: 11, overlap: 0 }),
      chunkTransformers: [
        {
          async transform(chunk, context) {
            expect(context.sourceId).toBeUndefined();
            expect(context.fingerprint).toBeUndefined();

            return {
              ...chunk,
              content: chunk.content.toUpperCase(),
            };
          },
        },
      ],
      metadataExtractors: [
        {
          async extract(chunk, context) {
            return {
              transformed: chunk.content,
              sourceLength: context.document.content.length,
            };
          },
        },
      ],
      chunkFilters: [
        {
          async shouldKeep(chunk) {
            return !chunk.content.includes("GAMMA");
          },
        },
      ],
      embedder: new MockEmbedder({ dimension: 4 }),
      store,
    });

    expect(result.documentsIndexed).toBe(1);
    expect(result.chunksTotal).toBe(1);
    expect(result.vectorsTotal).toBe(1);
    expect(store.getAll()[0]).toMatchObject({
      id: "doc-extensions#0",
      metadata: {
        source: "extensions",
        documentId: "doc-extensions",
        transformed: "ALPHA BETA",
        sourceLength: 22,
      },
    });
  });

  it("passes chunk context when chunk-stage processing fails", async () => {
    const onError = vi.fn();

    const result = await runIndexing({
      loader: {
        async load() {
          return [{ id: "doc-fail", content: "trigger failure" }];
        },
      },
      chunker: new SimpleChunker({ chunkSize: 20, overlap: 0 }),
      chunkTransformers: [
        {
          async transform() {
            throw new Error("chunk transform failed");
          },
        },
      ],
      embedder: new MockEmbedder({ dimension: 4 }),
      store: new MemoryVectorStore(),
      onError,
    });

    expect(result.documentsIndexed).toBe(0);
    expect(result.failedDocuments).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      name: "IndexingError",
      stage: "transform-chunk",
    });
    expect(onError.mock.calls[0]?.[1]).toMatchObject({
      documentId: "doc-fail",
      chunkId: "doc-fail#0",
      stage: "transform-chunk",
      mode: "full",
    });
  });

  it("propagates source and fingerprint contracts in incremental mode", async () => {
    const store = new MemoryVectorStore();

    const result = await runIndexing({
      loader: {
        async load() {
          return [
            {
              id: "doc-incremental",
              content: "Incremental content",
              metadata: {
                sourceId: "source-doc-1",
                fingerprint: "fp-from-metadata",
                title: "Incremental Title",
              },
            },
          ];
        },
      },
      mode: "incremental",
      sourceIdResolver(document) {
        return `${document.id}-resolved-source`;
      },
      fingerprintResolver() {
        return "fp-resolved";
      },
      metadataExtractors: [
        {
          async extract(_chunk, context) {
            return {
              seenSourceId: context.sourceId ?? "missing",
              seenFingerprint: context.fingerprint ?? "missing",
            };
          },
        },
      ],
      embedder: new MockEmbedder({ dimension: 4 }),
      store,
    });

    expect(result.documentsIndexed).toBe(1);
    expect(store.getLastWriteContext()).toMatchObject({
      documentId: "doc-incremental",
      mode: "incremental",
      sourceId: "doc-incremental-resolved-source",
      fingerprint: "fp-resolved",
      chunkIds: ["doc-incremental#0"],
    });
    expect(store.getAll()[0]?.metadata).toMatchObject({
      sourceId: "doc-incremental-resolved-source",
      fingerprint: "fp-resolved",
      seenSourceId: "doc-incremental-resolved-source",
      seenFingerprint: "fp-resolved",
    });
  });

  it("attaches chunk content onto vector metadata before upsert", async () => {
    const store = new MemoryVectorStore();
    const documentContent = "Exact chunk body for attach";

    await runIndexing({
      loader: {
        async load() {
          return [{ id: "doc-content", content: documentContent }];
        },
      },
      chunker: new SimpleChunker({ chunkSize: 100, overlap: 0 }),
      embedder: new MockEmbedder({ dimension: 4 }),
      store,
    });

    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0]?.metadata?.content).toBe(documentContent);
  });

  it("preserves caller-provided vector metadata content during upsert", async () => {
    const store = new MemoryVectorStore();

    await runIndexing({
      loader: {
        async load() {
          return [{ id: "doc-custom", content: "pipeline chunk body" }];
        },
      },
      chunker: new SimpleChunker({ chunkSize: 100, overlap: 0 }),
      embedder: {
        async embed(chunks) {
          return chunks.map((chunk) => ({
            id: chunk.id,
            values: [1, 0, 0, 0],
            metadata: {
              ...(chunk.metadata ?? {}),
              content: "custom-body",
            },
          }));
        },
      },
      store,
    });

    expect(store.getAll()[0]?.metadata?.content).toBe("custom-body");
  });
});
