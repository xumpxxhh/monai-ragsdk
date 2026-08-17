import { describe, expect, it, vi } from "vitest";

import { ChromaVectorStoreAdapter } from "../src/index.ts";

describe("ChromaVectorStoreAdapter", () => {
  it("returns early for empty vector batches", async () => {
    const getOrCreateCollection = vi.fn();
    const adapter = new ChromaVectorStoreAdapter({
      collectionName: "docs",
      client: {
        getOrCreateCollection,
      } as never,
    });

    await adapter.upsert([]);

    expect(getOrCreateCollection).not.toHaveBeenCalled();
  });

  it("creates the collection lazily and upserts vectors", async () => {
    const upsert = vi.fn(async () => undefined);
    const getOrCreateCollection = vi.fn(async () => ({ upsert }));
    const adapter = new ChromaVectorStoreAdapter({
      collectionName: "docs",
      host: "localhost",
      port: 8000,
      client: {
        getOrCreateCollection,
      } as never,
    });

    await adapter.upsert([
      {
        id: "chunk-1",
        values: [0.1, 0.2],
        metadata: {
          documentId: "doc-1",
          tags: ["guide", "sdk"],
        },
      },
    ]);

    expect(getOrCreateCollection).toHaveBeenCalledTimes(1);
    expect(getOrCreateCollection).toHaveBeenCalledWith({
      name: "docs",
      metadata: undefined,
      configuration: undefined,
      embeddingFunction: null,
    });
    expect(upsert).toHaveBeenCalledWith({
      ids: ["chunk-1"],
      embeddings: [[0.1, 0.2]],
      metadatas: [
        {
          documentId: "doc-1",
          tags: ["guide", "sdk"],
        },
      ],
    });
  });

  it("serializes nested metadata values for Chroma compatibility", async () => {
    const upsert = vi.fn(async () => undefined);
    const adapter = new ChromaVectorStoreAdapter({
      collectionName: "docs",
      client: {
        getOrCreateCollection: vi.fn(async () => ({ upsert })),
      } as never,
    });

    await adapter.upsert([
      {
        id: "chunk-1",
        values: [0.1, 0.2],
        metadata: {
          nested: {
            section: "intro",
            order: 1,
          },
          mixedList: ["intro", 1],
          flags: [true, false],
          nullable: null,
        },
      },
    ]);

    expect(upsert).toHaveBeenCalledWith({
      ids: ["chunk-1"],
      embeddings: [[0.1, 0.2]],
      metadatas: [
        {
          nested: '{"section":"intro","order":1}',
          mixedList: '["intro",1]',
          flags: [true, false],
          nullable: null,
        },
      ],
    });
  });

  it("reuses the same collection across multiple upserts", async () => {
    const upsert = vi.fn(async () => undefined);
    const getOrCreateCollection = vi.fn(async () => ({ upsert }));
    const adapter = new ChromaVectorStoreAdapter({
      collectionName: "docs",
      client: {
        getOrCreateCollection,
      } as never,
    });

    await adapter.upsert([{ id: "chunk-1", values: [1, 2] }]);
    await adapter.upsert([{ id: "chunk-2", values: [3, 4] }]);

    expect(getOrCreateCollection).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("throws before calling Chroma when vector dimensions differ", async () => {
    const getOrCreateCollection = vi.fn();
    const adapter = new ChromaVectorStoreAdapter({
      collectionName: "docs",
      client: {
        getOrCreateCollection,
      } as never,
    });

    await expect(
      adapter.upsert([
        { id: "chunk-1", values: [0.1, 0.2] },
        { id: "chunk-2", values: [0.3] },
      ]),
    ).rejects.toThrow(
      "ChromaVectorStoreAdapter requires all vectors in a batch to share the same dimension",
    );
    expect(getOrCreateCollection).not.toHaveBeenCalled();
  });

  it("surfaces Chroma collection errors without swallowing them", async () => {
    const adapter = new ChromaVectorStoreAdapter({
      collectionName: "docs",
      client: {
        getOrCreateCollection: vi.fn(async () => {
          throw new Error("collection unavailable");
        }),
      } as never,
    });

    await expect(
      adapter.upsert([{ id: "chunk-1", values: [0.1, 0.2] }]),
    ).rejects.toThrow("collection unavailable");
  });
});