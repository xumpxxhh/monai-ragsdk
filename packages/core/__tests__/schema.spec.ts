import { describe, expect, it } from "vitest";

import {
  ChunkSchema,
  DocumentSchema,
  JsonObjectSchema,
  JsonValueSchema,
  QuerySchema,
  RAGResponseSchema,
  VectorSchema,
} from "../src/index.ts";

describe("core schemas", () => {
  it("accepts a valid query", () => {
    expect(QuerySchema.parse({ query: "What is RAG?" })).toEqual({
      query: "What is RAG?",
    });
  });

  it("rejects an empty query", () => {
    const result = QuerySchema.safeParse({ query: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["query"]);
  });

  it("accepts deeply nested json values", () => {
    expect(
      JsonValueSchema.parse({
        level1: {
          level2: ["text", 1, true, null, { level3: ["leaf"] }],
        },
      }),
    ).toMatchObject({
      level1: {
        level2: ["text", 1, true, null, { level3: ["leaf"] }],
      },
    });
  });

  it("rejects unsupported json values", () => {
    const result = JsonValueSchema.safeParse({ invalid: undefined });

    expect(result.success).toBe(false);
    expect(result.error?.issues.length).toBeGreaterThan(0);
  });

  it("accepts plain json objects", () => {
    expect(
      JsonObjectSchema.parse({
        source: "unit-test",
        stats: {
          score: 0.99,
          tags: ["rag", "core"],
        },
      }),
    ).toMatchObject({
      source: "unit-test",
      stats: {
        score: 0.99,
        tags: ["rag", "core"],
      },
    });
  });

  it("accepts chunk metadata as a json object", () => {
    expect(
      ChunkSchema.parse({
        id: "chunk-1",
        content: "RAG combines retrieval and generation.",
        metadata: {
          source: "unit-test",
          score: 0.99,
        },
      }),
    ).toMatchObject({
      id: "chunk-1",
      metadata: {
        source: "unit-test",
        score: 0.99,
      },
    });
  });

  it("accepts a valid document", () => {
    expect(
      DocumentSchema.parse({
        id: "doc-1",
        content: "raw source content",
        metadata: {
          source: "markdown",
          tags: ["rag", "indexing"],
        },
      }),
    ).toMatchObject({
      id: "doc-1",
      content: "raw source content",
      metadata: {
        source: "markdown",
        tags: ["rag", "indexing"],
      },
    });
  });

  it("accepts a valid vector", () => {
    expect(
      VectorSchema.parse({
        id: "vector-1",
        values: [0.1, 0.2, 0.3],
        metadata: {
          documentId: "doc-1",
          source: "unit-test",
        },
      }),
    ).toMatchObject({
      id: "vector-1",
      values: [0.1, 0.2, 0.3],
      metadata: {
        documentId: "doc-1",
        source: "unit-test",
      },
    });
  });

  it("rejects non-object metadata", () => {
    const result = ChunkSchema.safeParse({
      id: "chunk-2",
      content: "invalid metadata",
      metadata: ["not-object"],
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) => issue.path[0] === "metadata"),
    ).toBe(true);
  });

  it("accepts a valid rag response", () => {
    expect(
      RAGResponseSchema.parse({
        answer: "RAG combines retrieval and generation.",
        chunks: [
          {
            id: "chunk-1",
            content: "retrieved context",
          },
        ],
      }),
    ).toMatchObject({
      answer: "RAG combines retrieval and generation.",
      chunks: [{ id: "chunk-1", content: "retrieved context" }],
    });
  });

  it("rejects a rag response with a non-string answer", () => {
    const result = RAGResponseSchema.safeParse({
      answer: 123,
      chunks: [],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["answer"]);
  });
});
