import { describe, expect, it, vi } from "vitest";

import { PgVectorStoreAdapter } from "../src/index.ts";

describe("PgVectorStoreAdapter", () => {
  it("returns early for empty vector batches", async () => {
    const query = vi.fn(async () => ({ rowCount: 0 }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      client: {
        query,
      },
    });

    await adapter.upsert([]);

    expect(query).not.toHaveBeenCalled();
  });

  it("upserts vectors with pgvector-compatible values", async () => {
    const query = vi.fn(async () => ({ rowCount: 1 }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      client: {
        query,
      },
    });

    await adapter.upsert([
      {
        id: "chunk-1",
        values: [0.1, 0.2],
        metadata: {
          documentId: "doc-1",
          content: "chunk content",
          sourceId: "docs/runtime",
          fingerprint: "fp:1",
        },
      },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain(
      'INSERT INTO "public"."rag_vectors"',
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      'ON CONFLICT ("id") DO UPDATE SET',
    );
    expect(query.mock.calls[0]?.[1]).toEqual([
      "chunk-1",
      "[0.1,0.2]",
      '{"documentId":"doc-1","content":"chunk content","sourceId":"docs/runtime","fingerprint":"fp:1"}',
      "chunk content",
      "docs/runtime",
      "fp:1",
    ]);
  });

  it("writes null content when metadata does not include it", async () => {
    const query = vi.fn(async () => ({ rowCount: 1 }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      client: {
        query,
      },
    });

    await adapter.upsert([
      {
        id: "chunk-1",
        values: [0.1, 0.2],
        metadata: {
          documentId: "doc-1",
        },
      },
    ]);

    expect(query.mock.calls[0]?.[1]?.[3]).toBeNull();
  });

  it("creates schema and table when ensureTable is enabled", async () => {
    const query = vi.fn(async () => ({ rowCount: 0 }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      ensureTable: true,
      client: {
        query,
      },
    });

    await adapter.upsert([{ id: "chunk-1", values: [1, 2] }]);

    expect(query).toHaveBeenCalledTimes(8);
    expect(query.mock.calls[0]?.[0]).toBe(
      "CREATE EXTENSION IF NOT EXISTS vector",
    );
    expect(query.mock.calls[1]?.[0]).toBe(
      'CREATE SCHEMA IF NOT EXISTS "public"',
    );
    expect(query.mock.calls[2]?.[0]).toContain(
      'CREATE TABLE IF NOT EXISTS "public"."rag_vectors"',
    );
    expect(query.mock.calls[2]?.[0]).toContain(
      '"embedding" VECTOR(2) NOT NULL',
    );
    expect(query.mock.calls[6]?.[0]).toContain("USING hnsw");
    expect(query.mock.calls[6]?.[0]).toContain("vector_cosine_ops");
  });

  it("deletes vectors by sourceIds and fingerprints", async () => {
    const query = vi.fn(async () => ({ rowCount: 1 }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      client: {
        query,
      },
    });

    await adapter.deleteByFilter({
      sourceIds: ["docs/runtime"],
      fingerprints: ["fp:1"],
    });

    expect(query).toHaveBeenCalledWith(
      'DELETE FROM "public"."rag_vectors" WHERE "source_id" = ANY($1::text[]) AND "fingerprint" = ANY($2::text[])',
      [["docs/runtime"], ["fp:1"]],
    );
  });

  it("lists distinct source records for incremental comparison", async () => {
    const query = vi.fn(async () => ({
      rowCount: 2,
      rows: [
        { source_id: "docs/runtime", fingerprint: "fp:1" },
        { source_id: "docs/faq", fingerprint: "fp:2" },
      ],
    }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      client: {
        query,
      },
    });

    await expect(adapter.listSourceRecords()).resolves.toEqual([
      { sourceId: "docs/runtime", fingerprint: "fp:1" },
      { sourceId: "docs/faq", fingerprint: "fp:2" },
    ]);
    expect(query.mock.calls[0]?.[0]).toContain("SELECT DISTINCT");
    expect(query.mock.calls[0]?.[0]).toContain('"source_id"');
  });

  it("throws before querying when vector dimensions differ", async () => {
    const query = vi.fn(async () => ({ rowCount: 0 }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      client: {
        query,
      },
    });

    await expect(
      adapter.upsert([
        { id: "chunk-1", values: [0.1, 0.2] },
        { id: "chunk-2", values: [0.3] },
      ]),
    ).rejects.toThrow(
      "PgVectorStoreAdapter requires all vectors in a batch to share the same dimension",
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("throws when batch dimension does not match configured dimension", async () => {
    const query = vi.fn(async () => ({ rowCount: 0 }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      dimension: 3,
      client: {
        query,
      },
    });

    await expect(
      adapter.upsert([{ id: "chunk-1", values: [0.1, 0.2] }]),
    ).rejects.toThrow(
      "PgVectorStoreAdapter requires vectors to match configured dimension 3",
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("surfaces client errors without swallowing them", async () => {
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      client: {
        query: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      },
    });

    await expect(
      adapter.upsert([{ id: "chunk-1", values: [0.1, 0.2] }]),
    ).rejects.toThrow("database unavailable");
  });

  it("does not close an injected client", async () => {
    const query = vi.fn(async () => ({ rowCount: 0 }));
    const adapter = new PgVectorStoreAdapter({
      tableName: "rag_vectors",
      client: {
        query,
      },
    });

    await expect(adapter.close()).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
