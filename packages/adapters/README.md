# adapters

## 定位

`adapters` 用于承载对外部生态能力的适配实现，负责把第三方 loader、splitter、embedding、vector store 等能力转换为当前 SDK 的统一契约。

## 当前目录

- `src/`：源码目录，仅允许放置 `.ts` 源码。
- `src/langchain/`：当前阶段优先实现的 LangChain 适配目录。
- `src/chroma/`：Chroma 向量存储适配目录。
- `src/pgvector/`：PostgreSQL + pgvector 向量存储适配目录。
- `src/ollama/`：Ollama embedding / chat 适配目录。
- `src/openai/`：OpenAI 兼容 embedding / chat 适配目录。
- `src/index.ts`：源码入口文件。
- `dist/`：构建产物输出目录，仅在执行构建后生成。

## 当前状态

当前已完成 LangChain 适配 MVP 第一版。

当前阶段目标：

- 实现 `LangChainLoaderAdapter`
- 实现 `LangChainDirectoryLoaderAdapter`
- 实现 `LangChainMarkdownDirectoryLoader`
- 实现 `LangChainTextSplitterAdapter`
- 实现 `LangChainSemanticChunkerAdapter`
- 实现常用 LangChain splitter 预设封装
- 实现 LangChain chunk transformer / metadata extractor 适配
- 实现 `LangChainEmbeddingsAdapter`
- 实现 `LangChainRuntimeRetrieverAdapter`
- 实现 `LangChainRuntimeGeneratorAdapter`
- 实现 `createLangChainBaseRetrieverRuntimeAdapter`
- 实现 `createLangChainChatModelRuntimeGenerator`
- 实现 `ChromaVectorStoreAdapter`
- 实现 `PgVectorStoreAdapter`
- 实现 `OpenAIEmbedder`
- 实现 `OpenAIRuntimeGenerator`
- 对齐 `@monai-ragsdk/core` 的共享模型
- 对齐 `@monai-ragsdk/indexing` 的 `Loader` / `Chunker` 等组件接口
- 对齐 `@monai-ragsdk/runtime` 的 `RetrievalRequest` / `RuntimeRetriever` / `RuntimeGenerator` 查询期契约
- 补充 `demo/` 与 `__tests__/`

当前仍未实现：

- Pinecone adapter
- Chroma 查询侧 adapter（已移出阶段 2）
- 更完整的 integration / smoke 覆盖

当前根目录已覆盖的跨包验证：

- `runtime + adapters` 查询链路
- `indexing + runtime` 查询链路

## 构建约定

- 对外入口固定指向 `dist/index.js` 与 `dist/index.d.ts`。
- 构建产物必须输出到 `dist/`。
- 不允许把 `.js`、`.d.ts` 等构建产物回写到 `src/`。

## 当前依赖方向

- 共享模型来自 `@monai-ragsdk/core`
- 组件接口当前来自 `@monai-ragsdk/indexing`
- 查询期编排契约来自 `@monai-ragsdk/runtime`
- 第三方 SDK 作为 `adapters` 的包级依赖声明
- `chromadb` 作为 Chroma store adapter 的包级运行时依赖
- `pg` 作为 PostgreSQL + pgvector store adapter 的包级运行时依赖

## 当前 loader 策略

- `LangChainLoaderAdapter`：接收任意 LangChain 风格 `load()` 实现。
- `LangChainDirectoryLoaderAdapter`：接收可配置的扩展名到 loader 映射，适合业务方自行组合不同文件 loader。
- `LangChainMarkdownDirectoryLoader`：当前仓库提供的默认 markdown 目录 loader，底层复用 LangChain 的 `DirectoryLoader` 与 `TextLoader`。

## 当前 chunker 策略

- `LangChainTextSplitterAdapter`：接收任意实现 `splitDocuments()` 的 LangChain splitter。
- `LangChainSemanticChunkerAdapter`：接收实现 `createDocuments()` 或 `splitDocuments()` 的 LangChain 风格 semantic chunker。
- `LangChainRecursiveCharacterTextSplitterAdapter`：当前仓库提供的默认文本切分预设，底层复用 LangChain 的 `RecursiveCharacterTextSplitter`。
- `LangChainTokenTextSplitterAdapter`：面向 token 预算敏感场景的预设封装，底层复用 LangChain 的 `TokenTextSplitter`。
- `LangChainMarkdownTextSplitterAdapter`：面向 markdown 文档场景的预设封装，底层复用 LangChain 的 `MarkdownTextSplitter`。

推荐优先级：

- 默认文本切分优先使用 `LangChainRecursiveCharacterTextSplitterAdapter`。
- 当需要接入语义切分器时，优先使用 `LangChainSemanticChunkerAdapter` 包裹第三方 semantic chunker。
- 当需要直接复用任意 LangChain splitter 时，再使用 `LangChainTextSplitterAdapter` 自行注入 splitter 实例。

说明：

- `LangChainSemanticChunkerAdapter` 当前是协议适配器，不是对某个官方 LangChain 具体 semantic chunker 类的一对一封装；它的目标是把符合 LangChain 风格的 semantic chunker 对象收敛到 `Chunker` 契约上。

## 当前 chunk transformer / metadata 策略

- `LangChainHeaderAwareChunkTransformer`：把 LangChain markdown / header metadata 转成 `indexing` 可消费的 `headerPath`，并可选写回 chunk content。
- `LangChainDocumentMetadataExtractor`：把 LangChain 常见 metadata 字段归一化为 `sourcePath`、`documentTitle`、`headerPath`、`sourceLocation` 等 canonical 字段。

## 当前 embedder 策略

- `LangChainEmbeddingsAdapter`：接收任意实现 `embedDocuments()` 的 LangChain embeddings 对象。
- `OpenAIEmbedder`：通过 OpenAI 兼容 `/embeddings` 适配为 `Embedder`，支持超时、重试与批处理。`baseUrl` 必须由调用方显式传入，SDK 不内置厂商地址。
- `OllamaEmbedder`：通过 Ollama `/api/embed` 适配为 `Embedder`，支持超时、重试与批处理。

推荐优先级：

- CLI 默认官方路径优先用 `OpenAIEmbedder`（OpenAI 兼容接口 + pgvector）。密钥只读 `EMBEDDING_API_KEY`。
- 本地离线 embedding 仍可用 `OllamaEmbedder`。
- 当需要接入任意 LangChain embeddings 实例时，再用 `LangChainEmbeddingsAdapter`。

## 当前查询期 adapter 策略

- `LangChainRuntimeRetrieverAdapter`：把 LangChain 风格 `invoke()` 检索器适配为 `@monai-ragsdk/runtime` 的 `RuntimeRetriever`，默认复用 runtime 的 indexing metadata 查询协议映射与 filter 过滤逻辑。
- `LangChainRuntimeGeneratorAdapter`：把 LangChain 风格 `invoke()` 生成器适配为 `@monai-ragsdk/runtime` 的 `RuntimeGenerator`，默认优先消费 runtime postprocessor 产出的 `promptContext`。
- `createLangChainBaseRetrieverRuntimeAdapter`：面向真实 LangChain `BaseRetriever` 实例的更薄封装，默认把 `RetrievalRequest` 映射到 `BaseRetriever.invoke(query, config)`，并继续复用 runtime 的候选映射与 filter 语义。
- `OllamaRuntimeGenerator`：通过 Ollama `/api/chat` 适配为 `RuntimeGenerator`。优先消费 runtime 的 `promptContext`；支持 `generate()` 与 `generateStream()`（NDJSON）。
- `OpenAIRuntimeGenerator`：通过 OpenAI 兼容 `/chat/completions` 适配为 `RuntimeGenerator`。`baseUrl` 与 `model` 由调用方显式传入，密钥回退 `OPENAI_API_KEY`；支持 `generate()` 与 `generateStream()`（SSE）。
- `OllamaStrategyModel` / `OpenAIStrategyModel`：实现 runtime 的 `RuntimeStrategyModel`，供后续 query rewrite / rerank 等策略件注入 LLM 能力。

推荐优先级：

- 当第三方对象本身就是 LangChain `BaseRetriever` / `BaseChatModel` 时，优先使用上述两类更薄的 preset 工厂。
- 当第三方 retriever 已有自己的查询对象时，通过 `mapRequest()` 把 `RetrievalRequest` 映射成第三方输入。
- 当第三方 retriever 只支持字符串查询时，直接复用默认 `effectiveQuery.query` 映射即可。
- 当第三方 generator 需要更复杂 prompt 结构时，通过 `buildPrompt()` 自定义，而不是把 prompt 拼装逻辑写回 runtime。

说明：

- `LangChainRuntimeRetrieverAdapter` 默认会在第三方 retriever 返回结果后，再应用一次 runtime `filters`，这样后续 third-party adapter 即使底层不原生支持 Phase D metadata filter，也仍能复用统一查询协议。
- `LangChainRuntimeGeneratorAdapter` 默认支持字符串结果，以及带 `content` 的 LangChain 风格对象结果；常见 `response_metadata` / `usage_metadata` 会被归一化收敛进 `generationMetadata`。

## 当前 store 策略

- `ChromaVectorStoreAdapter`：接收 Chroma 连接配置，并在 adapter 内部创建 `ChromaClient`，用于把 `@monai-ragsdk/core` 的 `Vector` 批量写入指定 collection。
- `PgVectorStoreAdapter`：接收 PostgreSQL 连接配置，并把 `@monai-ragsdk/core` 的 `Vector` 批量写入 pgvector 表，同时实现 `deleteByFilter()` 与 `listSourceRecords()`。`ensureTable` 会建立 source / fingerprint / GIN(tsv) 与 HNSW 余弦索引。调用方在用完后应调用 `close()` 释放 adapter 自建连接池。
- `PgVectorRuntimeRetrieverAdapter`：pgvector 查询期 retriever。并行做向量距离召回与 tsvector 关键词召回，按 RRF 融合后再复用 runtime 的 `filterRetrievalCandidatesByIndexingFilters()`。

推荐优先级：

- 默认生产路径优先 PostgreSQL + pgvector 读写闭环。
- 本地 / 自建 Chroma Server 仍可作为可选写入路径，当前只覆盖 `upsert`。
- 当前 Chroma adapter 仍只覆盖写入侧 `upsert`；查询期抽象统一通过 `@monai-ragsdk/runtime` 契约对接，不在 Chroma adapter 内部单独扩散查询协议。
- 当前 PgVector adapter 覆盖写入、`deleteByFilter()`、`listSourceRecords()`，查询期走 `PgVectorRuntimeRetrieverAdapter`。
- `runIndexing` 会消费 `listSourceRecords()` 与 `deleteByFilter()` 完成增量 skip / replace / stale cleanup。
- `PgVectorStoreAdapter` 第一版默认保留 `metadata`、`source_id`、`fingerprint` 字段；`content` 列读取 `Vector.metadata.content`。经 `runIndexing` 时会在 upsert 前补上 chunk 原文；直接 `store.upsert()` 必须自行带上 `metadata.content`，否则关键词召回和生成会拿到空上下文。
- `VectorStore.close()` 为可选方法：`PgVectorStoreAdapter` 在自建 `Pool` 时需要调用；注入的 client 不会被关闭。
- 如果业务方使用其他向量数据库，仍可自行实现 `@monai-ragsdk/indexing` 的 `VectorStore` 接口。

## 当前脚本

- `pnpm --filter @monai-ragsdk/adapters build`
- `pnpm --filter @monai-ragsdk/adapters test`
- `pnpm --filter @monai-ragsdk/adapters demo`
- `pnpm --filter @monai-ragsdk/adapters demo:chroma-store`
- `pnpm --filter @monai-ragsdk/adapters demo:langchain-extensions`
- `pnpm --filter @monai-ragsdk/adapters demo:langchain-runtime`
- `pnpm --filter @monai-ragsdk/adapters demo:pgvector-store`
- `pnpm --filter @monai-ragsdk/adapters demo:pgvector-runtime`
- `pnpm --filter @monai-ragsdk/adapters demo:openai-adapters`
- `pnpm --filter @monai-ragsdk/adapters demo:ollama-adapters`

## Chroma 示例

```ts
import { MockEmbedder, runIndexing } from "@monai-ragsdk/indexing";
import {
  ChromaVectorStoreAdapter,
  LangChainMarkdownDirectoryLoader,
  LangChainRecursiveCharacterTextSplitterAdapter,
} from "@monai-ragsdk/adapters";

const store = new ChromaVectorStoreAdapter({
  host: "localhost",
  port: 8000,
  collectionName: "rag-docs",
});

await runIndexing({
  loader: new LangChainMarkdownDirectoryLoader({
    path: "./docs",
    idPrefix: "doc",
  }),
  chunker: new LangChainRecursiveCharacterTextSplitterAdapter({
    chunkSize: 500,
    chunkOverlap: 50,
  }),
  embedder: new MockEmbedder({ dimension: 8 }),
  store,
});
```

说明：

- 该示例默认你已经启动本地 Chroma Server。
- adapter 会自动获取或创建指定的 collection。
- 当前只写入 `id`、`values` 与归一化后的 metadata；查询侧统一建议走 `runtime + adapters` 的查询期适配器组合。
