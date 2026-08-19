import { randomUUID } from 'node:crypto';

import type {
  RAGErrorRecord,
  RAGEvent,
  RAGEventName,
  RAGObserver,
  RAGTrace,
  TraceIdSource,
} from '@monai-ragsdk/observability';

import type {
  CreateRuntimeOptions,
  PostRetrievalResult,
  RetrievalRequest,
  Runtime,
  RuntimeContext,
  RuntimeDebugInfo,
  RuntimeGenerationResult,
  RuntimeObservationErrorRecord,
  RuntimeObservationRecord,
  RuntimeQueryInput,
  RuntimeResult,
  RuntimeRetrievalResult,
  RuntimeRunOptions,
  RuntimeSearchResult,
  RuntimeStage,
  RuntimeStreamEvent,
} from '../types/index.js';
import { toRuntimeError } from '../errors/index.js';
import {
  buildObservationAttributes,
  queryCheckpointOutput,
  summarizeCandidates,
} from '../observation/index.js';
import { assembleRuntimeResult, assembleRuntimeSearchResult } from './assemble-runtime-result.js';
import { iterateRuntimeGeneratorStream } from '../stages/generation/iterate-generation-stream.js';

/** 单次 run / runStream 的可观测状态；事件与错误先入本地缓冲，再安全通知 observer。 */
type RuntimeTraceState = {
  traceId: string;
  traceIdSource: TraceIdSource;
  requestId: string;
  startedAt: number;
  tags?: RuntimeRunOptions['trace'] extends infer T
    ? T extends { tags?: infer Tags }
      ? Tags
      : never
    : never;
  events: RAGEvent[];
  errors: RAGErrorRecord[];
};

/** run / runStream 共享的会话上下文，避免两套入口重复拼装 requestId / trace / timings。 */
type RuntimeRunSession = {
  observer: RAGObserver;
  context: RuntimeContext;
  trace: RuntimeTraceState;
  timings: Partial<Record<RuntimeStage | 'total', number>>;
  originalQuery: { query: string };
};

/** 前三阶段（pre-retrieval → retrieval → post-retrieval）的共享产物。 */
type PreGenerationStagesResult = {
  request: RetrievalRequest;
  retrievalResult: RuntimeRetrievalResult;
  postResult: PostRetrievalResult;
};

const defaultObserver: RAGObserver = {};

/**
 * 记录某一阶段耗时；用 finally 保证阶段失败时仍写入 timings，便于失败路径的 debug / 事件。
 */
async function withStageTiming<T>(
  timings: Partial<Record<RuntimeStage | 'total', number>>,
  stage: RuntimeStage,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();

  return run().finally(() => {
    timings[stage] = Date.now() - startedAt;
  });
}

/** 优先用调用方传入的 requestId；缺省用不透明 UUID，避免把 query 嵌进关联键。 */
function resolveRequestId(options: RuntimeRunOptions): string {
  return options.requestId ?? randomUUID();
}

function resolveTraceId(
  requestId: string,
  options: RuntimeRunOptions,
): { traceId: string; traceIdSource: TraceIdSource } {
  if (options.trace?.traceId) {
    return { traceId: options.trace.traceId, traceIdSource: 'provided' };
  }

  // 调用方只给了业务 requestId 时复用，便于和网关日志对上
  if (options.requestId) {
    return { traceId: requestId, traceIdSource: 'requestId' };
  }

  return { traceId: randomUUID(), traceIdSource: 'generated' };
}

function createTraceState(
  requestId: string,
  options: RuntimeRunOptions,
  startedAt: number,
): RuntimeTraceState {
  const { traceId, traceIdSource } = resolveTraceId(requestId, options);

  return {
    traceId,
    traceIdSource,
    requestId,
    startedAt,
    tags: options.trace?.tags,
    events: [],
    errors: [],
  };
}

/** 组装单次查询的 observer / context / trace；observe 闭包映射到 RAGEvent，失败隔离在 emit 内。 */
function createRunSession(
  runtime: CreateRuntimeOptions,
  input: RuntimeQueryInput,
  options: RuntimeRunOptions,
): RuntimeRunSession {
  const startedAt = Date.now();
  const requestId = resolveRequestId(options);
  const observer = runtime.observer ?? defaultObserver;
  const trace = createTraceState(requestId, options, startedAt);

  return {
    observer,
    context: {
      requestId,
      input,
      options,
      startedAt,
      observe: {
        async emit(record) {
          await emitMappedEvent(observer, trace, record);
        },
        async emitError(record) {
          await emitMappedError(observer, trace, record);
        },
      },
    },
    trace,
    timings: {},
    originalQuery: { query: input.query },
  };
}

/**
 * 观测回调失败必须吞掉：observer 是旁路，不能拖垮主查询链路。
 */
async function invokeObserverSafely(
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
  event: Omit<RAGEvent, 'traceId' | 'scope'>,
): Promise<RAGEvent> {
  const resolvedEvent: RAGEvent = {
    traceId: trace.traceId,
    scope: 'runtime',
    ...event,
  };

  trace.events.push(resolvedEvent);
  await invokeObserverSafely(() => observer.onEvent?.(resolvedEvent));

  return resolvedEvent;
}

async function emitError(
  observer: RAGObserver,
  trace: RuntimeTraceState,
  error: Omit<RAGErrorRecord, 'traceId' | 'scope'>,
): Promise<RAGErrorRecord> {
  const resolvedError: RAGErrorRecord = {
    traceId: trace.traceId,
    scope: 'runtime',
    ...error,
  };

  trace.errors.push(resolvedError);
  await invokeObserverSafely(() => observer.onError?.(resolvedError));

  return resolvedError;
}

function toRuntimeEventName(
  stage: string,
  action: RuntimeObservationRecord['action'],
): RAGEventName {
  return `runtime.${stage}.${action}`;
}

/** 把 context.observe 的本地记录映射成 RAGEvent，策略编排器无需依赖 observability 协议。 */
async function emitMappedEvent(
  observer: RAGObserver,
  trace: RuntimeTraceState,
  record: RuntimeObservationRecord,
): Promise<RAGEvent> {
  return emitEvent(observer, trace, {
    stage: record.stage,
    name: toRuntimeEventName(record.stage, record.action),
    timestamp: record.timestamp,
    ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}),
    ...(record.attributes ? { attributes: record.attributes } : {}),
  });
}

async function emitMappedError(
  observer: RAGObserver,
  trace: RuntimeTraceState,
  record: RuntimeObservationErrorRecord,
): Promise<RAGErrorRecord> {
  return emitError(observer, trace, {
    stage: record.stage,
    name: toRuntimeEventName(record.stage, record.action),
    timestamp: record.timestamp,
    error: record.error,
    ...(record.attributes ? { attributes: record.attributes } : {}),
  });
}

async function finalizeTrace(
  observer: RAGObserver,
  trace: RuntimeTraceState,
  status: 'ok' | 'error',
): Promise<void> {
  const endedAt = Date.now();
  const payload: RAGTrace = {
    traceId: trace.traceId,
    traceIdSource: trace.traceIdSource,
    requestId: trace.requestId,
    scope: 'runtime',
    startedAt: trace.startedAt,
    endedAt,
    durationMs: endedAt - trace.startedAt,
    status,
    tags: trace.tags,
    events: [...trace.events],
    ...(trace.errors.length > 0 ? { errors: [...trace.errors] } : {}),
  };

  await invokeObserverSafely(() => observer.onTraceEnd?.(payload));
}

function readGenerationModel(
  metadata: RuntimeGenerationResult['generationMetadata'],
): string | undefined {
  const model = metadata?.model;
  return typeof model === 'string' && model.trim().length > 0 ? model.trim() : undefined;
}

/** fan-out 融合后的分数是 RRF 口径；其它 retriever 仍是原始检索分。 */
function retrievalScoreKind(
  retrievalResult: RuntimeRetrievalResult,
): 'retriever' | 'rrf' {
  return retrievalResult.retrievalMetadata?.provider === 'fan-out' ? 'rrf' : 'retriever';
}

function citationRefs(chunks: Array<{ id: string }>): Array<{ index: number; chunkId: string }> {
  return chunks.map((chunk, offset) => ({
    index: offset + 1,
    chunkId: chunk.id,
  }));
}

/**
 * 执行 generation 之前的三阶段；run() / runStream() / search() 共用，避免检索语义分叉。
 * 各阶段异常统一包装为带 stage 的 RuntimeError。
 */
async function runPreGenerationStages(
  runtime: CreateRuntimeOptions,
  session: RuntimeRunSession,
): Promise<PreGenerationStagesResult> {
  const { observer, context, trace, timings, originalQuery } = session;

  const request = await withStageTiming(timings, 'pre-retrieval', async () => {
    try {
      return await runtime.preprocessor.preprocess(context.input, context);
    } catch (error) {
      throw toRuntimeError(error, 'pre-retrieval', originalQuery);
    }
  });

  await emitEvent(observer, trace, {
    stage: 'query',
    name: 'runtime.query.preprocess',
    timestamp: Date.now(),
    durationMs: timings['pre-retrieval'],
    attributes: buildObservationAttributes({
      output: queryCheckpointOutput(request),
    }),
  });

  await emitEvent(observer, trace, {
    stage: 'retrieval',
    name: 'runtime.retrieval.start',
    timestamp: Date.now(),
    attributes: buildObservationAttributes({
      output: { query: request.effectiveQuery.query },
    }),
  });

  const retrievalResult = await withStageTiming(timings, 'retrieval', async () => {
    try {
      return await runtime.retriever.retrieve(request, context);
    } catch (error) {
      throw toRuntimeError(error, 'retrieval', request.originalQuery, request.effectiveQuery);
    }
  });

  const retrievalProvider =
    typeof retrievalResult.retrievalMetadata?.provider === 'string'
      ? retrievalResult.retrievalMetadata.provider
      : undefined;

  await emitEvent(observer, trace, {
    stage: 'retrieval',
    name: 'runtime.retrieval.complete',
    timestamp: Date.now(),
    durationMs: timings.retrieval,
    attributes: buildObservationAttributes({
      counts: { candidates: retrievalResult.candidates.length },
      candidates: summarizeCandidates(
        retrievalResult.candidates,
        retrievalScoreKind(retrievalResult),
      ),
      ...(retrievalProvider ? { output: { provider: retrievalProvider } } : {}),
    }),
  });

  await emitEvent(observer, trace, {
    stage: 'post_retrieval',
    name: 'runtime.post_retrieval.start',
    timestamp: Date.now(),
    attributes: buildObservationAttributes({
      counts: { candidates: retrievalResult.candidates.length },
    }),
  });

  const postResult = await withStageTiming(timings, 'post-retrieval', async () => {
    try {
      return await runtime.postprocessor.postprocess(
        {
          request,
          candidates: retrievalResult.candidates,
        },
        context,
      );
    } catch (error) {
      throw toRuntimeError(error, 'post-retrieval', request.originalQuery, request.effectiveQuery);
    }
  });

  const selectedCount = postResult.selectedCandidates?.length ?? postResult.chunks.length;
  const droppedCount =
    postResult.droppedCandidates?.length ??
    Math.max(retrievalResult.candidates.length - postResult.chunks.length, 0);

  await emitEvent(observer, trace, {
    stage: 'post_retrieval',
    name: 'runtime.post_retrieval.select',
    timestamp: Date.now(),
    durationMs: timings['post-retrieval'],
    attributes: buildObservationAttributes({
      counts: {
        input: retrievalResult.candidates.length,
        selected: selectedCount,
        dropped: droppedCount,
        chunks: postResult.chunks.length,
      },
      output: {
        chunkIds: postResult.chunks.map((chunk) => chunk.id),
        ...(postResult.appliedStrategies && postResult.appliedStrategies.length > 0
          ? { appliedStrategies: postResult.appliedStrategies }
          : {}),
      },
    }),
  });

  return {
    request,
    retrievalResult,
    postResult,
  };
}

/**
 * 流式 generation 可能只给 complete、或只攒了 delta；统一成带非空 answer 的 GenerationResult。
 * 空答案由调用方再判错，避免这里 silently 伪造内容。
 */
function normalizeStreamGenerationResult(
  generationResult: RuntimeGenerationResult | undefined,
  streamedAnswer: string,
): RuntimeGenerationResult {
  if (generationResult?.answer) {
    return generationResult;
  }

  if (generationResult) {
    return {
      ...generationResult,
      answer: streamedAnswer,
    };
  }

  return { answer: streamedAnswer };
}

function createRuntimeDebugInfo(
  request: RetrievalRequest,
  retrievalResult: RuntimeRetrievalResult,
  postResult: PostRetrievalResult,
  timings: Partial<Record<RuntimeStage | 'total', number>>,
): RuntimeDebugInfo {
  const selectedCount = postResult.selectedCandidates?.length ?? postResult.chunks.length;
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
    // postprocessor 未写回时回退 request 上的预算 / 阈值，便于对照「意图 vs 实际」
    appliedBudget: postResult.appliedBudget ?? request.budget,
    appliedScoreThreshold: postResult.appliedScoreThreshold ?? request.rerank?.minScore,
    selectionTrace: postResult.selectionTrace,
    promptContext: postResult.promptContext,
  };
}

/**
 * 失败路径收尾：先发 fail 事件与 error，再以 error status 结束 trace。
 * 不吞掉原始异常，由调用方继续 throw。
 * search 与 run 共用收尾，仅事件名不同，避免 retrieve-only 被记成一次完整 run。
 */
async function finalizeFailedRuntimeRun(
  session: RuntimeRunSession,
  error: unknown,
  eventName: 'runtime.run.fail' | 'runtime.search.fail' = 'runtime.run.fail',
): Promise<void> {
  const { observer, trace, timings, context } = session;
  const runtimeError = error instanceof Error ? error : new Error(String(error));
  const stage =
    'stage' in runtimeError && typeof runtimeError.stage === 'string' ? runtimeError.stage : 'run';
  const code =
    'code' in runtimeError && typeof runtimeError.code === 'string' ? runtimeError.code : undefined;

  timings.total = Date.now() - context.startedAt;

  await emitEvent(observer, trace, {
    stage: 'run',
    name: eventName,
    timestamp: Date.now(),
    durationMs: timings.total,
    attributes: buildObservationAttributes({
      outcome: 'failed',
      output: { stage },
      error: {
        name: runtimeError.name,
        message: runtimeError.message,
        ...(code ? { code } : {}),
      },
    }),
  });

  await emitError(observer, trace, {
    stage,
    name: eventName,
    timestamp: Date.now(),
    error: {
      name: runtimeError.name,
      message: runtimeError.message,
      ...(code ? { code } : {}),
    },
    attributes: buildObservationAttributes({
      error: {
        name: runtimeError.name,
        message: runtimeError.message,
        ...(code ? { code } : {}),
      },
    }),
  });

  await finalizeTrace(observer, trace, 'error');
}

/**
 * 非流式一次跑完四阶段，返回与 runStream 最终 result 同构的 RuntimeResult。
 * generation 始终走 generate()，不套用流式超时 / 重试语义。
 */
export async function runRuntime(
  runtime: CreateRuntimeOptions,
  input: RuntimeQueryInput,
  options: RuntimeRunOptions = {},
): Promise<RuntimeResult> {
  const session = createRunSession(runtime, input, options);
  const { observer, context, trace, timings } = session;

  await emitEvent(observer, trace, {
    stage: 'query',
    name: 'runtime.query.receive',
    timestamp: Date.now(),
    attributes: buildObservationAttributes({
      output: { query: input.query },
    }),
  });

  try {
    const { request, retrievalResult, postResult } = await runPreGenerationStages(runtime, session);

    await emitEvent(observer, trace, {
      stage: 'generation',
      name: 'runtime.generation.start',
      timestamp: Date.now(),
      attributes: buildObservationAttributes({
        counts: { chunks: postResult.chunks.length },
      }),
    });

    const generationResult = await withStageTiming(timings, 'generation', async () => {
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
        throw toRuntimeError(error, 'generation', request.originalQuery, request.effectiveQuery);
      }
    });

    const generationModel = readGenerationModel(generationResult.generationMetadata);
    const citations = citationRefs(postResult.chunks);

    await emitEvent(observer, trace, {
      stage: 'generation',
      name: 'runtime.generation.complete',
      timestamp: Date.now(),
      durationMs: timings.generation,
      attributes: buildObservationAttributes({
        counts: {
          chunks: postResult.chunks.length,
          citations: citations.length,
        },
        output: {
          ...(generationModel ? { model: generationModel } : {}),
          citations,
          answerPreview: generationResult.answer.slice(0, 200),
        },
      }),
    });

    timings.total = Date.now() - context.startedAt;

    await emitEvent(observer, trace, {
      stage: 'run',
      name: 'runtime.run.complete',
      timestamp: Date.now(),
      durationMs: timings.total,
      attributes: buildObservationAttributes({
        counts: { chunks: postResult.chunks.length },
      }),
    });

    const debug: RuntimeDebugInfo | undefined = options.includeDebug
      ? createRuntimeDebugInfo(request, retrievalResult, postResult, timings)
      : undefined;

    await finalizeTrace(observer, trace, 'ok');

    return assembleRuntimeResult({
      generationResult,
      postResult,
      retrievalResult,
      request,
      requestId: context.requestId,
      traceId: trace.traceId,
      startedAt: context.startedAt,
      timings,
      streamed: false,
      debug,
    });
  } catch (error) {
    await finalizeFailedRuntimeRun(session, error);
    throw error;
  }
}

/**
 * 前三阶段与 run() 相同；generation 通过 generateStream（或回退 generate）向外推 delta。
 * 调用方必须把 iterable 消费完才能拿到最终 result，并让 observer 正常收尾。
 */
export async function* runRuntimeStream(
  runtime: CreateRuntimeOptions,
  input: RuntimeQueryInput,
  options: RuntimeRunOptions = {},
): AsyncIterable<RuntimeStreamEvent> {
  const session = createRunSession(runtime, input, options);
  const { observer, context, trace, timings } = session;

  await emitEvent(observer, trace, {
    stage: 'query',
    name: 'runtime.query.receive',
    timestamp: Date.now(),
    attributes: buildObservationAttributes({
      output: { query: input.query },
    }),
  });

  try {
    const { request, retrievalResult, postResult } = await runPreGenerationStages(runtime, session);

    await emitEvent(observer, trace, {
      stage: 'generation',
      name: 'runtime.generation.start',
      timestamp: Date.now(),
      attributes: buildObservationAttributes({
        counts: { chunks: postResult.chunks.length },
      }),
    });

    const generationStartedAt = Date.now();
    let streamedAnswer = '';
    let yieldedDelta = false;
    let generationResult: RuntimeGenerationResult | undefined;

    try {
      for await (const event of iterateRuntimeGeneratorStream(
        runtime.generator,
        {
          request,
          chunks: postResult.chunks,
          promptContext: postResult.promptContext,
        },
        context,
      )) {
        if (event.type === 'delta' && event.text) {
          streamedAnswer += event.text;
          yieldedDelta = true;
          yield {
            type: 'delta',
            text: event.text,
          };
          continue;
        }

        if (event.type === 'complete') {
          generationResult = event.result;
        }
      }
    } catch (error) {
      throw toRuntimeError(error, 'generation', request.originalQuery, request.effectiveQuery);
    }

    timings.generation = Date.now() - generationStartedAt;
    generationResult = normalizeStreamGenerationResult(generationResult, streamedAnswer);

    // 流式路径要求最终答案非空；与 run() 允许空字符串的历史行为刻意区分
    if (!generationResult.answer.trim()) {
      throw toRuntimeError(
        new Error('runtime stream generation returned an empty answer'),
        'generation',
        request.originalQuery,
        request.effectiveQuery,
      );
    }

    // 只给了 complete、没有 delta 时补一次，调用方可以只订阅 delta
    if (!yieldedDelta) {
      yield {
        type: 'delta',
        text: generationResult.answer,
      };
    }

    const generationModel = readGenerationModel(generationResult.generationMetadata);
    const citations = citationRefs(postResult.chunks);

    await emitEvent(observer, trace, {
      stage: 'generation',
      name: 'runtime.generation.complete',
      timestamp: Date.now(),
      durationMs: timings.generation,
      attributes: buildObservationAttributes({
        counts: {
          chunks: postResult.chunks.length,
          citations: citations.length,
        },
        output: {
          ...(generationModel ? { model: generationModel } : {}),
          streamed: true,
          citations,
          answerPreview: generationResult.answer.slice(0, 200),
        },
      }),
    });

    timings.total = Date.now() - context.startedAt;

    await emitEvent(observer, trace, {
      stage: 'run',
      name: 'runtime.run.complete',
      timestamp: Date.now(),
      durationMs: timings.total,
      attributes: buildObservationAttributes({
        counts: { chunks: postResult.chunks.length },
      }),
    });

    const debug: RuntimeDebugInfo | undefined = options.includeDebug
      ? createRuntimeDebugInfo(request, retrievalResult, postResult, timings)
      : undefined;

    await finalizeTrace(observer, trace, 'ok');

    yield {
      type: 'result',
      result: assembleRuntimeResult({
        generationResult,
        postResult,
        retrievalResult,
        request,
        requestId: context.requestId,
        traceId: trace.traceId,
        startedAt: context.startedAt,
        timings,
        streamed: true,
        debug,
      }),
    };
  } catch (error) {
    await finalizeFailedRuntimeRun(session, error);
    throw error;
  }
}

/**
 * retrieve-only：复用前三阶段，不进入 generation。
 * Collection.search() 与 runtime.search() 共用，避免门面再走一遍 run() 再丢掉 answer。
 */
export async function runRuntimeSearch(
  runtime: CreateRuntimeOptions,
  input: RuntimeQueryInput,
  options: RuntimeRunOptions = {},
): Promise<RuntimeSearchResult> {
  const session = createRunSession(runtime, input, options);
  const { observer, context, trace, timings } = session;

  await emitEvent(observer, trace, {
    stage: 'query',
    name: 'runtime.query.receive',
    timestamp: Date.now(),
    attributes: buildObservationAttributes({
      output: { query: input.query },
    }),
  });

  try {
    const { request, retrievalResult, postResult } = await runPreGenerationStages(runtime, session);

    timings.total = Date.now() - context.startedAt;

    await emitEvent(observer, trace, {
      stage: 'run',
      name: 'runtime.search.complete',
      timestamp: Date.now(),
      durationMs: timings.total,
      attributes: buildObservationAttributes({
        counts: { chunks: postResult.chunks.length },
      }),
    });

    const debug: RuntimeDebugInfo | undefined = options.includeDebug
      ? createRuntimeDebugInfo(request, retrievalResult, postResult, timings)
      : undefined;

    await finalizeTrace(observer, trace, 'ok');

    return assembleRuntimeSearchResult({
      postResult,
      retrievalResult,
      request,
      requestId: context.requestId,
      traceId: trace.traceId,
      startedAt: context.startedAt,
      timings,
      debug,
    });
  } catch (error) {
    await finalizeFailedRuntimeRun(session, error, 'runtime.search.fail');
    throw error;
  }
}

/**
 * 把 CreateRuntimeOptions 收成 Runtime 门面；createRuntime() 的内部实现入口。
 */
export function createRunnableRuntime(runtime: CreateRuntimeOptions): Runtime {
  return {
    run(input, options) {
      return runRuntime(runtime, input, options);
    },
    search(input, options) {
      return runRuntimeSearch(runtime, input, options);
    },
    runStream(input, options) {
      return runRuntimeStream(runtime, input, options);
    },
  };
}
