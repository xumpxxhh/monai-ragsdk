import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createConsoleExporter,
  createJsonlTraceExporter,
  createRAGObserver,
  createMemoryTraceExporter,
  type RAGErrorRecord,
  type RAGEvent,
  type RAGTrace,
} from "../src/index.js";

describe("observability phase 4", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0, tempDirs.length)
        .map((dirPath) => rm(dirPath, { recursive: true, force: true })),
    );
  });

  async function createTempFilePath(fileName: string): Promise<string> {
    const dirPath = await mkdtemp(join(tmpdir(), "rag-observability-"));
    tempDirs.push(dirPath);

    return join(dirPath, fileName);
  }

  it("exports traces to multiple exporters via createRAGObserver", async () => {
    const memoryExporter = createMemoryTraceExporter();
    const customExporter = {
      export: vi.fn(async () => {}),
    };
    const observer = createRAGObserver({
      serviceName: "kb-api",
      environment: "test",
      defaultTags: {
        app: "internal-kb",
      },
      exporters: [memoryExporter, customExporter],
    });

    const event: RAGEvent = {
      traceId: "trace-1",
      scope: "runtime",
      stage: "retrieval",
      name: "runtime.retrieval.complete",
      timestamp: new Date().toISOString(),
    };

    await observer.onEvent?.(event);
    await observer.onTraceEnd?.({
      traceId: "trace-1",
      scope: "runtime",
      startedAt: new Date().toISOString(),
      status: "ok",
      events: [],
    });

    expect(customExporter.export).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace-1",
        serviceName: "kb-api",
        environment: "test",
        tags: {
          app: "internal-kb",
        },
        events: [event],
      }),
    );
    expect(memoryExporter.getTraces()).toHaveLength(1);
  });

  it("keeps exporting when one exporter fails", async () => {
    const memoryExporter = createMemoryTraceExporter();
    const failingExporter = {
      export: vi.fn(async () => {
        throw new Error("export failed");
      }),
    };
    const observer = createRAGObserver({
      exporters: [failingExporter, memoryExporter],
    });

    await expect(
      observer.onTraceEnd?.({
        traceId: "trace-2",
        scope: "runtime",
        startedAt: new Date().toISOString(),
        status: "ok",
        events: [],
      }),
    ).resolves.toBeUndefined();

    expect(failingExporter.export).toHaveBeenCalledTimes(1);
    expect(memoryExporter.getTraces()).toHaveLength(1);
  });

  it("persists buffered errors when trace summary arrives later", async () => {
    const memoryExporter = createMemoryTraceExporter();
    const observer = createRAGObserver({
      exporters: [memoryExporter],
    });
    const errorRecord: RAGErrorRecord = {
      traceId: "trace-3",
      scope: "indexing",
      stage: "embed",
      name: "indexing.embed.fail",
      timestamp: new Date().toISOString(),
      error: {
        name: "IndexingError",
        message: "embedding failed",
      },
    };

    await observer.onError?.(errorRecord);
    await observer.onTraceEnd?.({
      traceId: "trace-3",
      scope: "indexing",
      startedAt: new Date().toISOString(),
      status: "error",
      events: [],
    });

    expect(memoryExporter.getTraces()[0]).toMatchObject({
      errors: [errorRecord],
    });
  });

  it("supports memory exporter trace inspection and clearing", async () => {
    const exporter = createMemoryTraceExporter();
    const trace: RAGTrace = {
      traceId: "trace-4",
      scope: "runtime",
      startedAt: new Date().toISOString(),
      status: "ok",
      events: [],
    };

    await exporter.export(trace);

    expect(exporter.getTraces()).toEqual([trace]);

    exporter.clear();

    expect(exporter.getTraces()).toEqual([]);
  });

  it("logs trace summaries through the console exporter", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const exporter = createConsoleExporter({ level: "info" });

    await exporter.export({
      traceId: "trace-5",
      scope: "runtime",
      startedAt: new Date().toISOString(),
      durationMs: 25,
      status: "ok",
      events: [],
    });

    expect(infoSpy).toHaveBeenCalledWith("[runtime] trace.ok 25ms events=0");
  });

  it("writes trace records as JSONL", async () => {
    const filePath = await createTempFilePath("traces.jsonl");
    const exporter = createJsonlTraceExporter({ filePath });
    const firstTrace: RAGTrace = {
      traceId: "trace-jsonl-1",
      scope: "runtime",
      startedAt: new Date().toISOString(),
      status: "ok",
      events: [],
    };
    const secondTrace: RAGTrace = {
      traceId: "trace-jsonl-2",
      scope: "indexing",
      startedAt: new Date().toISOString(),
      status: "error",
      events: [],
    };

    await exporter.export(firstTrace);
    await exporter.export(secondTrace);
    await exporter.flush?.();

    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      firstTrace,
      secondTrace,
    ]);
  });

  it("truncates the target file when append is disabled", async () => {
    const filePath = await createTempFilePath("traces.jsonl");
    await writeFile(filePath, '{"stale":true}\n', "utf-8");

    const exporter = createJsonlTraceExporter({
      filePath,
      append: false,
    });
    const trace: RAGTrace = {
      traceId: "trace-jsonl-3",
      scope: "runtime",
      startedAt: new Date().toISOString(),
      status: "ok",
      events: [],
    };

    await exporter.export(trace);
    await exporter.flush?.();

    const content = await readFile(filePath, "utf-8");

    expect(content.trim().split("\n")).toEqual([JSON.stringify(trace)]);
  });

  it("works with createRAGObserver to persist finalized traces", async () => {
    const filePath = await createTempFilePath("observer-traces.jsonl");
    const exporter = createJsonlTraceExporter({ filePath });
    const observer = createRAGObserver({ exporters: [exporter] });
    const event: RAGEvent = {
      traceId: "trace-jsonl-4",
      scope: "runtime",
      stage: "query",
      name: "runtime.query.receive",
      timestamp: new Date().toISOString(),
      attributes: {
        query: "公司年假政策是什么？",
      },
    };

    await observer.onEvent?.(event);
    await observer.onTraceEnd?.({
      traceId: "trace-jsonl-4",
      scope: "runtime",
      startedAt: new Date().toISOString(),
      status: "ok",
      events: [],
    });
    await observer.flush?.();

    const content = await readFile(filePath, "utf-8");
    const [persistedTrace] = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as RAGTrace);

    expect(persistedTrace).toMatchObject({
      traceId: "trace-jsonl-4",
      events: [event],
    });
  });

  it("forwards flush and shutdown to exporters", async () => {
    const exporter = {
      export: vi.fn(async () => {}),
      flush: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
    };
    const observer = createRAGObserver({ exporters: [exporter] });

    await observer.flush?.();
    await observer.shutdown?.();

    expect(exporter.flush).toHaveBeenCalledTimes(1);
    expect(exporter.shutdown).toHaveBeenCalledTimes(1);
  });
});
