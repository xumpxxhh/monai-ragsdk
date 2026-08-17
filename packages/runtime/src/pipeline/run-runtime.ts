import type {
  RAGErrorRecord,
  RAGEvent,
  RAGObserver,
  RAGTrace,
  TraceIdSource,
} from "@monai-ragsdk/observability";

import type {
  CreateRuntimeOptions,
  Runtime,
  RuntimeContext,
  RuntimeDebugInfo,
  RuntimeQueryInput,
  RuntimeResult,
  RuntimeRunOptions,
  RuntimeStage,
} from "../types/index.js";
import { toRuntimeError } from "../errors/index.js";

type RuntimeTraceState = {
  traceId: string;
  traceIdSource: TraceIdSource;
  requestId: string;
  startedAt: number;
  tags?: RuntimeRunOptions["trace"] extends infer T
    ? T extends { tags?: infer Tags }
      ? Tags
      : never
    : never;
  events: RAGEvent[];
  errors: RAGErrorRecord[];
};

const defaultObserver: RAGObserver = {};

function measureStage<T>(
  timings: Partial<Record<RuntimeStage | "total", number>>,
  stage: RuntimeStage,
  factory: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();

  return factory().finally(() => {
    timings[stage] = Date.now() - startedAt;
  });
}

function buildRequestId(
  input: RuntimeQueryInput,
  options: RuntimeRunOptions,
): string {
  return options.requestId ?? `runtime:${input.query}:${Date.now()}`;
}

function buildTraceState(
  requestId: string,
  options: RuntimeRunOptions,
  startedAt: number,
): RuntimeTraceState {
  const providedTraceId = options.trace?.traceId;

  return {
    traceId: providedTraceId ?? requestId,
    traceIdSource: providedTraceId ? "provided" : "requestId",
    requestId,
    startedAt,
    tags: options.trace?.tags,
    events: [],
    errors: [],
  };
}

async function notifyObserver(
  callback: (() => void | Promise<void>) | undefined,
): Promise<void> {
  try {
    await callback?.();
  } catch {
    // Observer failures must never break the runtime pipeline.
  }
}

async function emitEvent(
  observer: RAGObserver,
  trace: RuntimeTraceState,
  event: Omit<RAGEvent, "traceId" | "scope">,
): Promise<RAGEvent> {
  const resolvedEvent: RAGEvent = {
    traceId: trace.traceId,
    scope: "runtime",
    ...event,
  };

  trace.events.push(resolvedEvent);
  await notifyObserver(() => observer.onEvent?.(resolvedEvent));

  return resolvedEvent;
}

async function emitError(
  observer: RAGObserver,
  trace: RuntimeTraceState,
  error: Omit<RAGErrorRecord, "traceId" | "scope">,
): Promise<RAGErrorRecord> {
  const resolvedError: RAGErrorRecord = {
    traceId: trace.traceId,
    scope: "runtime",
    ...error,
  };

  trace.errors.push(resolvedError);
  await notifyObserver(() => observer.onError?.(resolvedError));

  return resolvedError;
}

async function endTrace(
  observer: RAGObserver,
  trace: RuntimeTraceState,
  status: "ok" | "error",
): Promise<void> {
  const endedAt = Date.now();
  const payload: RAGTrace = {
    traceId: trace.traceId,
    traceIdSource: trace.traceIdSource,
    requestId: trace.requestId,
    scope: "runtime",
    startedAt: new Date(trace.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs: endedAt - trace.startedAt,
    status,
    tags: trace.tags,
    events: [...trace.events],
    ...(trace.errors.length > 0 ? { errors: [...trace.errors] } : {}),
  };

  await notifyObserver(() => observer.onTraceEnd?.(payload));
}

function summarizeSelectionTrace(
  selectionTrace: RuntimeDebugInfo["selectionTrace"],
): { count: number; selected: number; dropped: number } | undefined {
  if (!selectionTrace || selectionTrace.length === 0) {
    return undefined;
  }

  const selected = selectionTrace.filter((entry) => entry.selected).length;

  return {
    count: selectionTrace.length,
    selected,
    dropped: selectionTrace.length - selected,
  };
}

function buildDebugInfo(
  request: ReturnType<
    CreateRuntimeOptions["preprocessor"]["preprocess"]
  > extends Promise<infer T>
    ? T
    : never,
  retrievalResult: ReturnType<
    CreateRuntimeOptions["retriever"]["retrieve"]
  > extends Promise<infer T>
    ? T
    : never,
  postResult: ReturnType<
    CreateRuntimeOptions["postprocessor"]["postprocess"]
  > extends Promise<infer T>
    ? T
    : never,
  timings: Partial<Record<RuntimeStage | "total", number>>,
): RuntimeDebugInfo {
  const selectedCount =
    postResult.selectedCandidates?.length ?? postResult.chunks.length;
  const droppedCount =
    postResult.droppedCandidates?.length ??
    Math.max(retrievalResult.candidates.length - selectedCount, 0);

  return {
    timings,
    route: request.route,
    rewriteReason: request.rewriteReason,
    retrievalStrategy: request.strategy,
    rerankStrategy: request.rerank?.strategy,
    indexingMode: request.indexingMode,
    filters: request.filters,
    retrievedCount: retrievalResult.candidates.length,
    selectedCount,
    droppedCount,
    finalChunkCount: postResult.chunks.length,
    appliedBudget: postResult.appliedBudget ?? request.budget,
    appliedScoreThreshold:
      postResult.appliedScoreThreshold ?? request.rerank?.minScore,
    selectionTrace: postResult.selectionTrace,
    promptContext: postResult.promptContext,
  };
}

export async function runRuntime(
  runtime: CreateRuntimeOptions,
  input: RuntimeQueryInput,
  options: RuntimeRunOptions = {},
): Promise<RuntimeResult> {
  const observer = runtime.observer ?? defaultObserver;
  const startedAt = Date.now();
  const requestId = buildRequestId(input, options);
  const context: RuntimeContext = {
    requestId,
    input,
    options,
    startedAt,
  };
  const trace = buildTraceState(requestId, options, startedAt);
  const timings: Partial<Record<RuntimeStage | "total", number>> = {};
  const originalQuery = { query: input.query };

  await emitEvent(observer, trace, {
    stage: "query",
    name: "runtime.query.receive",
    timestamp: new Date().toISOString(),
    attributes: {
      requestId,
      query: input.query,
      ...(options.trace?.tags ? { tags: options.trace.tags } : {}),
    },
  });

  try {
    const request = await measureStage(timings, "pre-retrieval", async () => {
      try {
        return await runtime.preprocessor.preprocess(input, context);
      } catch (error) {
        throw toRuntimeError(error, "pre-retrieval", originalQuery);
      }
    });

    await emitEvent(observer, trace, {
      stage: "query",
      name: "runtime.query.preprocess",
      timestamp: new Date().toISOString(),
      durationMs: timings["pre-retrieval"],
      attributes: {
        requestId,
        originalQuery: request.originalQuery.query,
        effectiveQuery: request.effectiveQuery.query,
        ...(request.route ? { route: request.route } : {}),
        ...(request.rewriteReason
          ? { rewriteReason: request.rewriteReason }
          : {}),
        ...(request.strategy ? { strategy: request.strategy } : {}),
        ...(request.filters ? { filters: request.filters } : {}),
      },
    });

    await emitEvent(observer, trace, {
      stage: "retrieval",
      name: "runtime.retrieval.start",
      timestamp: new Date().toISOString(),
      attributes: {
        requestId,
        effectiveQuery: request.effectiveQuery.query,
      },
    });

    const retrievalResult = await measureStage(
      timings,
      "retrieval",
      async () => {
        try {
          return await runtime.retriever.retrieve(request, context);
        } catch (error) {
          throw toRuntimeError(
            error,
            "retrieval",
            request.originalQuery,
            request.effectiveQuery,
          );
        }
      },
    );

    await emitEvent(observer, trace, {
      stage: "retrieval",
      name: "runtime.retrieval.complete",
      timestamp: new Date().toISOString(),
      durationMs: timings.retrieval,
      attributes: {
        requestId,
        candidateCount: retrievalResult.candidates.length,
        emptyRetrieval: retrievalResult.candidates.length === 0,
        ...(request.filters ? { filters: request.filters } : {}),
      },
    });

    await emitEvent(observer, trace, {
      stage: "post_retrieval",
      name: "runtime.post_retrieval.start",
      timestamp: new Date().toISOString(),
      attributes: {
        requestId,
        candidateCount: retrievalResult.candidates.length,
      },
    });

    const postResult = await measureStage(
      timings,
      "post-retrieval",
      async () => {
        try {
          return await runtime.postprocessor.postprocess(
            {
              request,
              candidates: retrievalResult.candidates,
            },
            context,
          );
        } catch (error) {
          throw toRuntimeError(
            error,
            "post-retrieval",
            request.originalQuery,
            request.effectiveQuery,
          );
        }
      },
    );

    await emitEvent(observer, trace, {
      stage: "post_retrieval",
      name: "runtime.post_retrieval.select",
      timestamp: new Date().toISOString(),
      durationMs: timings["post-retrieval"],
      attributes: {
        requestId,
        inputCandidateCount: retrievalResult.candidates.length,
        selected:
          postResult.selectedCandidates?.length ?? postResult.chunks.length,
        dropped:
          postResult.droppedCandidates?.length ??
          Math.max(
            retrievalResult.candidates.length - postResult.chunks.length,
            0,
          ),
        selectedChunkIds: postResult.chunks.map((chunk) => chunk.id),
        ...(postResult.droppedCandidates
          ? {
              droppedChunkIds: postResult.droppedCandidates.map(
                (candidate) => candidate.chunk.id,
              ),
            }
          : {}),
        ...(postResult.appliedScoreThreshold !== undefined
          ? { appliedScoreThreshold: postResult.appliedScoreThreshold }
          : {}),
        ...(postResult.appliedBudget
          ? { appliedBudget: postResult.appliedBudget }
          : {}),
        ...(summarizeSelectionTrace(postResult.selectionTrace)
          ? {
              selectionTraceSummary: summarizeSelectionTrace(
                postResult.selectionTrace,
              ),
            }
          : {}),
      },
    });

    await emitEvent(observer, trace, {
      stage: "generation",
      name: "runtime.generation.start",
      timestamp: new Date().toISOString(),
      attributes: {
        requestId,
        chunkCount: postResult.chunks.length,
      },
    });

    const generationResult = await measureStage(
      timings,
      "generation",
      async () => {
        try {
          return await runtime.generator.generate(
            {
              request,
              chunks: postResult.chunks,
              promptContext: postResult.promptContext,
            },
            context,
          );
        } catch (error) {
          throw toRuntimeError(
            error,
            "generation",
            request.originalQuery,
            request.effectiveQuery,
          );
        }
      },
    );

    await emitEvent(observer, trace, {
      stage: "generation",
      name: "runtime.generation.complete",
      timestamp: new Date().toISOString(),
      durationMs: timings.generation,
      attributes: {
        requestId,
        contextChunkIds: postResult.chunks.map((chunk) => chunk.id),
        contextLength: postResult.promptContext?.length ?? 0,
        answerPreview: generationResult.answer.slice(0, 200),
      },
    });

    timings.total = Date.now() - context.startedAt;

    await emitEvent(observer, trace, {
      stage: "run",
      name: "runtime.run.complete",
      timestamp: new Date().toISOString(),
      durationMs: timings.total,
      attributes: {
        requestId,
        finalChunkCount: postResult.chunks.length,
      },
    });

    const debug: RuntimeDebugInfo | undefined = options.includeDebug
      ? buildDebugInfo(request, retrievalResult, postResult, timings)
      : undefined;

    await endTrace(observer, trace, "ok");

    return {
      answer: generationResult.answer,
      chunks: postResult.chunks,
      originalQuery: request.originalQuery,
      effectiveQuery: request.effectiveQuery,
      retrievalMetadata: retrievalResult.retrievalMetadata,
      postRetrievalMetadata: postResult.postRetrievalMetadata,
      generationMetadata: generationResult.generationMetadata,
      ...(debug ? { debug } : {}),
    };
  } catch (error) {
    const runtimeError =
      error instanceof Error ? error : new Error(String(error));
    const stage =
      "stage" in runtimeError && typeof runtimeError.stage === "string"
        ? runtimeError.stage
        : "run";
    const code =
      "code" in runtimeError && typeof runtimeError.code === "string"
        ? runtimeError.code
        : undefined;

    timings.total = Date.now() - context.startedAt;

    await emitEvent(observer, trace, {
      stage: "run",
      name: "runtime.run.fail",
      timestamp: new Date().toISOString(),
      durationMs: timings.total,
      attributes: {
        requestId,
        stage,
        errorName: runtimeError.name,
        errorMessage: runtimeError.message,
        ...(code ? { errorCode: code } : {}),
      },
    });

    await emitError(observer, trace, {
      stage,
      name: "runtime.run.fail",
      timestamp: new Date().toISOString(),
      error: {
        name: runtimeError.name,
        message: runtimeError.message,
        ...(code ? { code } : {}),
      },
      attributes: {
        requestId,
      },
    });

    await endTrace(observer, trace, "error");

    throw error;
  }
}

export function createRunnableRuntime(runtime: CreateRuntimeOptions): Runtime {
  return {
    run(input, options) {
      return runRuntime(runtime, input, options);
    },
  };
}
