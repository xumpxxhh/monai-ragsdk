import {
  OpenAIEmbedder,
  OpenAIRuntimeGenerator,
  OpenAIStrategyModel,
  PgVectorRuntimeRetrieverAdapter,
  PgVectorStoreAdapter,
} from '@monai-ragsdk/adapters';
import type { RuntimeStrategyModel } from '@monai-ragsdk/runtime';

import type { ExampleConfig } from './example-config.js';
import { embedQuery } from './embed-query.js';

export type ExampleStack = {
  config: ExampleConfig;
  embedder: OpenAIEmbedder;
  store: PgVectorStoreAdapter;
  retriever: PgVectorRuntimeRetrieverAdapter;
  generator: OpenAIRuntimeGenerator;
  strategyModel: RuntimeStrategyModel;
  close: () => Promise<void>;
};

/** 创建示例默认栈：OpenAI 兼容 embedding / chat + pgvector；策略 LLM 与 chat 共用 baseUrl / model。 */
export function createExampleStack(config: ExampleConfig): ExampleStack {
  const embedder = new OpenAIEmbedder({
    model: config.embeddingModel,
    baseUrl: config.embeddingBaseUrl,
    dimension: config.dimension,
    // 兼容接口单次 batch 上限通常小于默认 32，长文档按 10 条拆开避免 400
    batchSize: 10,
  });
  const store = new PgVectorStoreAdapter({
    connectionString: config.connectionString,
    tableName: config.tableName,
    dimension: config.dimension,
    ensureTable: true,
  });
  const retriever = new PgVectorRuntimeRetrieverAdapter({
    connectionString: config.connectionString,
    tableName: config.tableName,
    embedQuery: async (query) => embedQuery(embedder, query),
  });
  const generator = new OpenAIRuntimeGenerator({
    model: config.chatModel,
    baseUrl: config.chatBaseUrl,
  });
  const strategyModel = new OpenAIStrategyModel({
    model: config.chatModel,
    baseUrl: config.chatBaseUrl,
  });

  return {
    config,
    embedder,
    store,
    retriever,
    generator,
    strategyModel,
    async close() {
      // store / retriever 各自持有连接池，用完必须都关，否则进程会挂住
      await store.close();
      await retriever.close();
    },
  };
}
