import { describe, expect, it } from "vitest";

import {
  GenerationError,
  RAGCoreError,
  RetrievalError,
  ValidationError,
} from "../src/index.ts";

describe("core errors", () => {
  it("keeps subclass names", () => {
    expect(new ValidationError("invalid query").name).toBe("ValidationError");
    expect(new RetrievalError("retrieve failed").name).toBe("RetrievalError");
    expect(new GenerationError("generate failed").name).toBe("GenerationError");
  });

  it("inherits from RAGCoreError", () => {
    expect(new ValidationError("invalid query")).toBeInstanceOf(RAGCoreError);
    expect(new RetrievalError("retrieve failed")).toBeInstanceOf(RAGCoreError);
    expect(new GenerationError("generate failed")).toBeInstanceOf(RAGCoreError);
  });

  it("preserves error cause", () => {
    const cause = new Error("root cause");
    const error = new ValidationError("invalid query", { cause });

    expect(error.cause).toBe(cause);
  });
});
