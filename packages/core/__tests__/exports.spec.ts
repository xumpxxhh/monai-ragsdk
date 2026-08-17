import { describe, expect, expectTypeOf, it } from "vitest";

import * as srcExports from "../src/index.ts";
import * as distExports from "../dist/index.js";
import type {
  Chunk,
  Document,
  Generator,
  Query,
  RAGPipeline,
  RAGResponse,
  Retriever,
  Vector,
} from "../src/index.ts";

describe("core export surface", () => {
  it("keeps dist runtime exports aligned with src runtime exports", () => {
    expect(Object.keys(distExports).sort()).toEqual(
      Object.keys(srcExports).sort(),
    );
  });

  it("exposes schemas and error constructors from dist", () => {
    expect(distExports.QuerySchema).toBeDefined();
    expect(distExports.ChunkSchema).toBeDefined();
    expect(distExports.DocumentSchema).toBeDefined();
    expect(distExports.VectorSchema).toBeDefined();
    expect(distExports.RAGResponseSchema).toBeDefined();
    expect(distExports.JsonValueSchema).toBeDefined();
    expect(distExports.JsonObjectSchema).toBeDefined();
    expect(distExports.RAGCoreError).toBeDefined();
    expect(distExports.ValidationError).toBeDefined();
    expect(distExports.RetrievalError).toBeDefined();
    expect(distExports.GenerationError).toBeDefined();
  });

  it("preserves the intended public types", () => {
    expectTypeOf<Query>().toEqualTypeOf<{ query: string }>();
    expectTypeOf<Chunk>().toMatchObjectType<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<Document>().toMatchObjectType<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<Vector>().toMatchObjectType<{
      id: string;
      values: number[];
      metadata?: Record<string, unknown>;
    }>();
    expectTypeOf<RAGResponse>().toMatchObjectType<{
      answer: string;
      chunks: Chunk[];
    }>();
    expectTypeOf<Retriever>().toHaveProperty("retrieve");
    expectTypeOf<Generator>().toHaveProperty("generate");
    expectTypeOf<RAGPipeline>().toBeFunction();
  });
});
