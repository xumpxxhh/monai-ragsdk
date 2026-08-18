import { describe, expect, it } from "vitest";

import { MemoryVectorStore, MockEmbedder } from "../src/index.ts";

describe("MockEmbedder and MemoryVectorStore", () => {
  it("creates deterministic vectors for chunks", async () => {
    const embedder = new MockEmbedder({ dimension: 4 });
    const vectors = await embedder.embed([
      {
        id: "chunk-1",
        content: "hello indexing",
        metadata: { source: "test" },
      },
    ]);

    expect(vectors).toHaveLength(1);
    expect(vectors[0]?.id).toBe("chunk-1");
    expect(vectors[0]?.values).toHaveLength(4);
    expect(vectors[0]?.metadata).toMatchObject({ source: "test" });
  });

  it("stores vectors in memory and replaces duplicate ids", async () => {
    const store = new MemoryVectorStore();

    await store.upsert([
      { id: "vector-1", values: [1, 2], metadata: { source: "first" } },
    ]);
    await store.upsert([
      { id: "vector-1", values: [3, 4], metadata: { source: "second" } },
    ]);

    expect(store.size()).toBe(1);
    expect(store.getById("vector-1")).toMatchObject({
      values: [3, 4],
      metadata: { source: "second" },
    });
  });

  it("supports deleting vectors by reserved incremental filters", async () => {
    const store = new MemoryVectorStore();

    await store.upsert([
      {
        id: "vector-1",
        values: [1, 2],
        metadata: { sourceId: "source-a", fingerprint: "fp-a" },
      },
      {
        id: "vector-2",
        values: [3, 4],
        metadata: { sourceId: "source-b", fingerprint: "fp-b" },
      },
    ]);

    await store.deleteByFilter?.({ sourceIds: ["source-a"] });

    expect(store.size()).toBe(1);
    expect(store.getById("vector-1")).toBeUndefined();
    expect(store.getById("vector-2")).toBeDefined();
  });

  it("lists distinct source records for incremental comparison", async () => {
    const store = new MemoryVectorStore();

    await store.upsert([
      {
        id: "vector-1",
        values: [1, 2],
        metadata: { sourceId: "source-a", fingerprint: "fp-a" },
      },
      {
        id: "vector-2",
        values: [3, 4],
        metadata: { sourceId: "source-a", fingerprint: "fp-a" },
      },
      {
        id: "vector-3",
        values: [5, 6],
        metadata: { sourceId: "source-b", fingerprint: "fp-b" },
      },
    ]);

    await expect(store.listSourceRecords()).resolves.toEqual([
      { sourceId: "source-a", fingerprint: "fp-a" },
      { sourceId: "source-b", fingerprint: "fp-b" },
    ]);
  });
});
