import type { Embedder } from '@monai-ragsdk/indexing';
import { OpenAIEmbedder, createOpenAIChatAdapters } from '@monai-ragsdk/adapters';
import {
  createMemoryTraceExporter,
  createRAGObserver,
  type RAGErrorRecord,
  type RAGEvent,
  type RAGTrace,
  type MemoryTraceExporter,
  type RAGObserver,
} from '@monai-ragsdk/observability';
import type { RuntimeGenerator, RuntimeStrategyModel } from '@monai-ragsdk/runtime';

import { loadServerConfig, type ServerConfig } from '../config/env.js';
import { createDotsChatFetch } from './dots-chat-fetch.js';

export type SharedStack = {
  config: ServerConfig;
  embedder: Embedder;
  generator: RuntimeGenerator;
  strategyModel: RuntimeStrategyModel;
  observer: RAGObserver;
  memoryExporter: MemoryTraceExporter;
};

/** 按 traceId 订阅 live observer 回调；SSE 写失败不得拖死 runtime。 */
export type ObserverLiveListener = {
  onEvent?: (event: RAGEvent) => void;
  onError?: (error: RAGErrorRecord) => void;
};

const liveListeners = new Map<string, Set<ObserverLiveListener>>();

/**
 * 订阅指定 traceId 的 onEvent / onError。返回取消函数。
 * 监听器抛错会被吞掉，避免影响主链路与其它订阅方。
 */
export function subscribeObserver(traceId: string, listener: ObserverLiveListener): () => void {
  let set = liveListeners.get(traceId);
  if (!set) {
    set = new Set();
    liveListeners.set(traceId, set);
  }
  set.add(listener);
  return () => {
    const current = liveListeners.get(traceId);
    if (!current) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      liveListeners.delete(traceId);
    }
  };
}

function notifyLiveListeners(
  traceId: string,
  kind: 'onEvent' | 'onError',
  payload: RAGEvent | RAGErrorRecord,
): void {
  const set = liveListeners.get(traceId);
  if (!set || set.size === 0) {
    return;
  }
  for (const listener of set) {
    try {
      if (kind === 'onEvent') {
        listener.onEvent?.(payload as RAGEvent);
      } else {
        listener.onError?.(payload as RAGErrorRecord);
      }
    } catch {
      // 订阅方失败隔离：SSE 写失败等不得拖死 runtime
    }
  }
}

/**
 * 在 exporter 缓冲之外再 fan-out 给 live 订阅方，供 ask SSE 实时推送。
 * 先写完内层 buffer/export，再通知订阅，保证 memoryExporter 与 live 顺序一致。
 */
function wrapObserverWithLiveFanout(inner: RAGObserver): RAGObserver {
  return {
    async onEvent(event) {
      await inner.onEvent?.(event);
      notifyLiveListeners(event.traceId, 'onEvent', event);
    },
    async onError(error) {
      await inner.onError?.(error);
      notifyLiveListeners(error.traceId, 'onError', error);
    },
    async onTraceEnd(trace) {
      await inner.onTraceEnd?.(trace);
    },
    async flush() {
      await inner.flush?.();
    },
    async shutdown() {
      await inner.shutdown?.();
      liveListeners.clear();
    },
  };
}

/**
 * 把查询文本编成单条向量。retriever 只吃 number[]，不走完整 Chunk 写入路径。
 */
export async function embedQuery(embedder: Embedder, query: string): Promise<number[]> {
  const [vector] = await embedder.embed([
    {
      id: 'query',
      content: query,
    },
  ]);

  if (!vector) {
    throw new Error('failed to build query vector');
  }

  return vector.values;
}

let shared: SharedStack | undefined;

/**
 * 进程级共享模型与观测器。按知识库拆开的是 pgvector 表，而不是 embedding / chat 客户端。
 * chat Generator 与 StrategyModel 共用同一 OpenAIChatClient，避免双 new。
 * 缺少 API Key 时在首次调用处失败，让 /health 与 /collections 仍能在未配置时启动。
 */
export function getSharedStack(): SharedStack {
  if (!shared) {
    const config = loadServerConfig();
    const embedder = new OpenAIEmbedder({
      model: config.embeddingModel,
      baseUrl: config.embeddingBaseUrl,
      dimension: config.dimension,
      batchSize: 10,
    });
    const dotsFetch = createDotsChatFetch();
    const { generator, strategyModel } = createOpenAIChatAdapters({
      model: config.chatModel,
      baseUrl: config.chatBaseUrl,
      apiKey: config.chatApiKey,
      fetch: dotsFetch,
    });
    const memoryExporter = createMemoryTraceExporter();
    const baseObserver = createRAGObserver({
      serviceName: 'monai-ragsdk-server',
      environment: 'local',
      exporters: [memoryExporter],
      defaultTags: { app: 'server' },
    });

    shared = {
      config,
      embedder,
      generator,
      strategyModel,
      observer: wrapObserverWithLiveFanout(baseObserver),
      memoryExporter,
    };
  }

  return shared;
}

export async function shutdownSharedStack(): Promise<void> {
  if (!shared) {
    return;
  }
  await shared.observer.shutdown?.();
  shared = undefined;
}

/**
 * 取出 observability 的“完整 trace”（events/errors 等）。
 * 注意：这是 memory trace exporter 的内存态数据；只有当 runtime/indexing 正常触发 onTraceEnd 时才会出现在这里。
 */
export function listObserverTraces(): RAGTrace[] {
  const s = getSharedStack();
  return s.memoryExporter.getTraces();
}

/** 按 traceId 取单条 observer 全链路；仅进程内存，重启后不可用。 */
export function getObserverTrace(traceId: string): RAGTrace | undefined {
  return listObserverTraces().find((trace) => trace.traceId === traceId);
}

/** 清空 memoryExporter 中已导出的 trace，避免列表无限增长。 */
export function clearObserverTraces(): void {
  const s = getSharedStack();
  s.memoryExporter.clear();
}
