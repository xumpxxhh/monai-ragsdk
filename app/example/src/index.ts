import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LangChainMarkdownDirectoryLoader,
  OpenAIEmbedder,
  OpenAIRuntimeGenerator,
  PgVectorRuntimeRetrieverAdapter,
  PgVectorStoreAdapter,
} from "@monai-ragsdk/adapters";
import { SimpleChunker, runIndexing } from "@monai-ragsdk/indexing";
import { createDefaultRuntime } from "@monai-ragsdk/runtime";

import { embedQuery } from "./embed-query.js";

const DEFAULT_PGVECTOR_CONNECTION_STRING =
  "postgresql://monai:monai@localhost:5432/monai_ragsdk";
const DEFAULT_TABLE_NAME = "example_vectors";
const DEFAULT_EMBEDDING_BASE_URL =
  "https://llm-5vs4jf61x3o1aul1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
const DEFAULT_CHAT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_CHAT_MODEL = "deepseek-v4-flash";
const EXAMPLE_QUERY = "pgvector 是什么？它和 PostgreSQL 是什么关系？";

/**
 * 默认栈闭环示例：assets markdown → 增量索引写入 pgvector → 检索 → OpenAI 兼容生成。
 * embedding 读 EMBEDDING_API_KEY，chat 读 OPENAI_API_KEY；baseUrl 由本文件显式传入，不依赖 SDK 默认厂商地址。
 */
async function main(): Promise<void> {
  const assetsDirectory = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "assets",
  );
  const dimension = 1024;
  const connectionString =
    process.env.PGVECTOR_CONNECTION_STRING?.trim() ||
    DEFAULT_PGVECTOR_CONNECTION_STRING;
  const tableName =
    process.env.PGVECTOR_TABLE_NAME?.trim() || DEFAULT_TABLE_NAME;
  const embeddingBaseUrl =
    process.env.EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_BASE_URL;
  const chatBaseUrl =
    process.env.OPENAI_BASE_URL?.trim() || DEFAULT_CHAT_BASE_URL;
  const chatModel = process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
  const embedder = new OpenAIEmbedder({
    model: "text-embedding-v3",
    baseUrl: embeddingBaseUrl,
    dimension,
    // 兼容接口单次 batch 上限通常小于默认 32，长文档按 10 条拆开避免 400
    batchSize: 10,
  });
  const store = new PgVectorStoreAdapter({
    connectionString,
    tableName,
    dimension,
    ensureTable: true,
  });
  const retriever = new PgVectorRuntimeRetrieverAdapter({
    connectionString,
    tableName,
    embedQuery: async (query) => embedQuery(embedder, query),
  });

  try {
    const result = await runIndexing({
      loader: new LangChainMarkdownDirectoryLoader({
        path: assetsDirectory,
        idPrefix: "asset",
      }),
      chunker: new SimpleChunker({
        chunkSize: 500,
        overlap: 50,
      }),
      embedder,
      store,
      // 持久库按 source 指纹跳过未变化文档，避免重复调用 embedding
      mode: "incremental",
      sourceIdResolver(document) {
        const source = document.metadata?.source;
        return typeof source === "string" && source.length > 0
          ? source
          : document.id;
      },
      fingerprintResolver(document) {
        return createHash("sha256").update(document.content).digest("hex");
      },
    });
    const sourceRecords = await store.listSourceRecords();
    const runtime = createDefaultRuntime({
      retriever,
      generator: new OpenAIRuntimeGenerator({
        model: chatModel,
        baseUrl: chatBaseUrl,
      }),
    });
    const askResult = await runtime.run({
      query: EXAMPLE_QUERY,
    });

    console.log("indexing + ask example passed");
    console.log(
      JSON.stringify(
        {
          assetsDirectory,
          pgvector: {
            tableName,
            dimension,
            ensureTable: true,
          },
          result,
          sourceRecords,
          query: EXAMPLE_QUERY,
          answer: askResult.answer,
          chunks: askResult.chunks.map((chunk) => ({
            id: chunk.id,
            content: chunk.content,
            metadata: chunk.metadata,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    // store / retriever 各自持有连接池，用完必须都关，否则进程会挂住
    await store.close();
    await retriever.close();
  }
}

await main();
