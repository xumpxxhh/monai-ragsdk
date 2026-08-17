import { describe, expect, it, vi } from "vitest";

import type {
  RAGErrorRecord,
  RAGEvent,
  RAGTrace,
} from "@monai-ragsdk/observability";

import { RuntimeError, createRuntime } from "../src/index.ts";

describe("runtime observer integration", () => {
  it("keeps runtime behavior unchanged when no observer is provided", async () => {
    const runtime = createRuntime({
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
          };
        },
      },
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: {
                  id: "chunk-1",
                  content: "retrieved content",
                },
                score: 0.9,
              },
            ],
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return {
            chunks: [candidates[0]!.chunk],
          };
        },
      },
      generator: {
        async generate() {
          return {
            answer: "answer",
          };
        },
      },
    });

    await expect(runtime.run({ query: "hello" })).resolves.toMatchObject({
      answer: "answer",
      chunks: [{ id: "chunk-1", content: "retrieved content" }],
      originalQuery: { query: "hello" },
      effectiveQuery: { query: "hello" },
    });
  });

  it("emits runtime events and trace summaries when an observer is provided", async () => {
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();
    const runtime = createRuntime({
      observer: {
        onEvent,
        onTraceEnd,
      },
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: `${input.query} rewritten` },
            route: "kb",
            rewriteReason: "prefer kb route",
            strategy: "metadata-first",
            filters: {
              sourceIds: ["docs/runtime"],
            },
          };
        },
      },
      retriever: {
        async retrieve(request) {
          return {
            candidates: [
              {
                chunk: {
                  id: "chunk-1",
                  content: request.effectiveQuery.query,
                },
                score: 0.91,
              },
              {
                chunk: {
                  id: "chunk-2",
                  content: "dropped",
                },
                score: 0.4,
              },
            ],
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return {
            chunks: [candidates[0]!.chunk],
            selectedCandidates: [candidates[0]!],
            droppedCandidates: [candidates[1]!],
          };
        },
      },
      generator: {
        async generate({ request }) {
          return {
            answer: `answer for ${request.effectiveQuery.query}`,
          };
        },
      },
    });

    await runtime.run(
      { query: "hello" },
      {
        requestId: "request-1",
        trace: {
          traceId: "trace-1",
          tags: {
            app: "internal-kb",
          },
        },
      },
    );

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "runtime.query.preprocess" }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "runtime.retrieval.complete" }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "runtime.post_retrieval.select" }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "runtime.generation.complete" }),
    );
    expect(onTraceEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace-1",
        requestId: "request-1",
        status: "ok",
      }),
    );
  });

  it("swallows observer failures without breaking runtime.run", async () => {
    const runtime = createRuntime({
      observer: {
        async onEvent() {
          throw new Error("observer failed");
        },
      },
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
          };
        },
      },
      retriever: {
        async retrieve() {
          return {
            candidates: [
              {
                chunk: {
                  id: "chunk-1",
                  content: "retrieved content",
                },
                score: 0.9,
              },
            ],
          };
        },
      },
      postprocessor: {
        async postprocess({ candidates }) {
          return {
            chunks: [candidates[0]!.chunk],
          };
        },
      },
      generator: {
        async generate() {
          return {
            answer: "answer",
          };
        },
      },
    });

    await expect(runtime.run({ query: "hello" })).resolves.toMatchObject({
      answer: "answer",
    });
  });

  it("emits runtime.run.fail and error records on stage failures", async () => {
    const onEvent = vi.fn<(event: RAGEvent) => Promise<void>>();
    const onError = vi.fn<(error: RAGErrorRecord) => Promise<void>>();
    const onTraceEnd = vi.fn<(trace: RAGTrace) => Promise<void>>();
    const runtime = createRuntime({
      observer: {
        onEvent,
        onError,
        onTraceEnd,
      },
      preprocessor: {
        async preprocess(input) {
          return {
            originalQuery: { query: input.query },
            effectiveQuery: { query: input.query },
          };
        },
      },
      retriever: {
        async retrieve() {
          throw new Error("retriever failed");
        },
      },
      postprocessor: {
        async postprocess() {
          return { chunks: [] };
        },
      },
      generator: {
        async generate() {
          return { answer: "never" };
        },
      },
    });

    await expect(runtime.run({ query: "fail here" })).rejects.toBeInstanceOf(
      RuntimeError,
    );

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "runtime.run.fail" }),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "retrieval",
        name: "runtime.run.fail",
        error: expect.objectContaining({
          name: "RuntimeError",
          message: "retriever failed",
        }),
      }),
    );
    expect(onTraceEnd).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });
});
