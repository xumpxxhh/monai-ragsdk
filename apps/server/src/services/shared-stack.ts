import type { Embedder } from '@monai-ragsdk/indexing';
import {
  OpenAIEmbedder,
  OpenAIRuntimeGenerator,
  OpenAIStrategyModel,
} from '@monai-ragsdk/adapters';
import {
  createMemoryTraceExporter,
  createRAGObserver,
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
 * 缺少 API Key 时在首次调用处失败，让 /health 与 /connection 仍能在未配置时启动。
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
    const generator = new OpenAIRuntimeGenerator({
      model: config.chatModel,
      baseUrl: config.chatBaseUrl,
      apiKey: config.chatApiKey,
      fetch: dotsFetch,
    });
    const strategyModel = new OpenAIStrategyModel({
      model: config.chatModel,
      baseUrl: config.chatBaseUrl,
      apiKey: config.chatApiKey,
      fetch: dotsFetch,
    });
    const memoryExporter = createMemoryTraceExporter();
    const observer = createRAGObserver({
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
      observer,
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
