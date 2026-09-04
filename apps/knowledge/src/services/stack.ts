import type { Embedder } from '@monai-ragsdk/indexing';
import { OpenAIEmbedder, createOpenAIChatAdapters } from '@monai-ragsdk/adapters';
import { createRAGObserver } from '@monai-ragsdk/observability';
import type { RuntimeGenerator, RuntimeStrategyModel } from '@monai-ragsdk/runtime';
import type { RAGObserver } from '@monai-ragsdk/observability';

import { loadKnowledgeConfig, type KnowledgeConfig } from '../config/env.js';

export type KnowledgeStack = {
  config: KnowledgeConfig;
  embedder: Embedder;
  strategyModel: RuntimeStrategyModel;
  observer: RAGObserver;
  searchOnlyGenerator: RuntimeGenerator;
};

/**
 * search-only 服务不应进入 generation；createRuntimeFromConfig 仍要求 generator 字段，故注入会抛错的桩。
 */
const searchOnlyGenerator: RuntimeGenerator = {
  async generate() {
    throw new Error('knowledge 服务只支持 search，不调用 generation');
  },
};

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

let shared: KnowledgeStack | undefined;

/** 进程级共享 embedding / 策略 LLM；按库拆分的是 pgvector 表而非客户端。 */
export function getKnowledgeStack(): KnowledgeStack {
  if (!shared) {
    const config = loadKnowledgeConfig();
    const embedder = new OpenAIEmbedder({
      model: config.embeddingModel,
      baseUrl: config.embeddingBaseUrl,
      dimension: config.dimension,
      batchSize: 10,
    });
    const { strategyModel } = createOpenAIChatAdapters({
      model: config.chatModel,
      baseUrl: config.chatBaseUrl,
      apiKey: config.chatApiKey,
    });
    const observer = createRAGObserver({
      serviceName: 'monai-ragsdk-knowledge',
      environment: 'local',
      defaultTags: { app: 'knowledge' },
    });

    shared = {
      config,
      embedder,
      strategyModel,
      observer,
      searchOnlyGenerator,
    };
  }

  return shared;
}

export async function shutdownKnowledgeStack(): Promise<void> {
  if (!shared) {
    return;
  }
  await shared.observer.shutdown?.();
  shared = undefined;
}
