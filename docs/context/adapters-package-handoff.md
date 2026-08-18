# adapters 包交接文档

## 目的

本文档用于说明 `packages/adapters` 当前已落地的 MVP 范围、目录结构、依赖方向与验证现状，方便后续 AI 或开发者继续迭代。

## 当前阶段

`adapters` 已完成 LangChain 适配 MVP 第一版，并补充了 Chroma 向量存储写入 adapter。

当前已实现：

- `LangChainLoaderAdapter`
- `LangChainDirectoryLoaderAdapter`
- `LangChainMarkdownDirectoryLoader`
- `LangChainTextSplitterAdapter`
- `LangChainSemanticChunkerAdapter`
- `LangChainRecursiveCharacterTextSplitterAdapter`
- `LangChainTokenTextSplitterAdapter`
- `LangChainMarkdownTextSplitterAdapter`
- `LangChainHeaderAwareChunkTransformer`
- `LangChainDocumentMetadataExtractor`
- `LangChainEmbeddingsAdapter`
- `LangChainRuntimeRetrieverAdapter`
- `LangChainRuntimeGeneratorAdapter`
- `createLangChainBaseRetrieverRuntimeAdapter`
- `createLangChainChatModelRuntimeGenerator`
- `ChromaVectorStoreAdapter`
- `PgVectorStoreAdapter`
- `PgVectorRuntimeRetrieverAdapter`
- `OllamaEmbedder`
- `OllamaRuntimeGenerator`
- `OpenAIEmbedder`
- `OpenAIRuntimeGenerator`
- LangChain `Document -> @monai-ragsdk/core Document` 映射
- LangChain split result -> `@monai-ragsdk/core Chunk` 映射
- LangChain embedding result -> `@monai-ragsdk/core Vector` 映射
- LangChain retriever result -> `@monai-ragsdk/runtime RetrievalCandidate` 映射
- LangChain generator result -> `@monai-ragsdk/runtime RuntimeGenerationResult` 映射
- metadata JSON 化收敛工具
- 包级 `demo/` 与 `__tests__/`

当前未实现：

- 流式 chat 输出
- Pinecone adapter
- Chroma 查询侧 adapter
- 其他外部 loader / vector store adapter
- 更完整的 integration / smoke 覆盖

## 依赖方向

- `@monai-ragsdk/core`：共享模型与 JSON 类型边界
- `@monai-ragsdk/indexing`：`Loader` 与 `Chunker` 组件接口
- `@monai-ragsdk/runtime`：查询期 `RuntimeRetriever` / `RuntimeGenerator` 契约与 Phase D 查询协议辅助函数
- `@langchain/classic`：目录与文本文件 loader
- `@langchain/core`：LangChain `Document` 类型
- `@langchain/textsplitters`：LangChain splitter 实现
- LangChain embeddings 风格对象：通过 `embedDocuments()` 接入第三方 embedding 能力
- `chromadb`：Chroma 客户端，用于 `VectorStore` 写入适配
- `pg`：PostgreSQL 客户端，用于 pgvector `VectorStore` 写入适配

约束：

- 第三方 SDK 必须声明在 `packages/adapters/package.json`，不要装到根目录。
- 如果后续要增加外部依赖，先遵循 `docs/decisions/package-installation-strategy.md`。

## 目录结构

```text
packages/adapters/
  src/
    index.ts
    chroma/
      index.ts
      stores/
    langchain/
      index.ts
      chunkers/
      chunk-transformers/
      loaders/
      metadata/
      retrievers/
      generators/
      shared/
    ollama/
      embedders/
      generators/
      shared/
    openai/
      embedders/
      generators/
      shared/
    pgvector/
      stores/
      retrievers/
  __tests__/
  demo/
```

说明：

- `src/langchain/loaders/`：LangChain loader 适配实现
- `src/langchain/chunkers/`：LangChain splitter 适配实现
- `src/langchain/chunk-transformers/`：LangChain metadata 到 chunk 上下文增强的适配实现
- `src/langchain/metadata/`：LangChain metadata 到 indexing canonical metadata 的抽取适配实现
- `src/langchain/embedders/`：LangChain embeddings 适配实现
- `src/langchain/retrievers/`：LangChain 查询期 retriever 适配实现
- `src/langchain/generators/`：LangChain 查询期 generator 适配实现
- `src/langchain/shared/`：metadata / document / vector 映射辅助工具
- `src/chroma/stores/`：Chroma 向量存储写入适配实现
- `src/pgvector/`：pgvector 写入、删除、source 记录与查询期 retriever
- `src/ollama/`：Ollama embedding / chat 适配实现
- `src/openai/`：OpenAI 兼容 embedding / chat 适配实现

## 公开导出

当前 `@monai-ragsdk/adapters` 已通过根入口导出：

- `LangChainLoaderAdapter`
- `LangChainDirectoryLoaderAdapter`
- `LangChainMarkdownDirectoryLoader`
- `LangChainTextSplitterAdapter`
- `LangChainSemanticChunkerAdapter`
- `LangChainRecursiveCharacterTextSplitterAdapter`
- `LangChainTokenTextSplitterAdapter`
- `LangChainMarkdownTextSplitterAdapter`
- `LangChainHeaderAwareChunkTransformer`
- `LangChainDocumentMetadataExtractor`
- `LangChainEmbeddingsAdapter`
- `LangChainRuntimeRetrieverAdapter`
- `LangChainRuntimeGeneratorAdapter`
- `createLangChainBaseRetrieverRuntimeAdapter`
- `createLangChainChatModelRuntimeGenerator`
- `ChromaVectorStoreAdapter`
- `PgVectorStoreAdapter`
- `PgVectorRuntimeRetrieverAdapter`
- `OllamaEmbedder`
- `OllamaRuntimeGenerator`
- `OpenAIEmbedder`
- `OpenAIRuntimeGenerator`

如果后续继续扩展 LangChain 相关能力，应优先保持该导出面稳定，再新增更细分的包内目录导出。

## 当前行为约定

- 当 LangChain 文档没有 `id` 时，`LangChainLoaderAdapter` 使用 `idPrefix-index` 生成回退 id。
- `LangChainDirectoryLoaderAdapter` 允许调用方自行配置扩展名到 LangChain 文件 loader 的映射。
- `LangChainMarkdownDirectoryLoader` 默认处理 `.md` 与 `.markdown`，并默认忽略未知扩展名。
- 当 LangChain metadata 不是 JSON 兼容结构时，会在映射阶段递归收敛；不兼容字段会被丢弃。
- 当 metadata 收敛后为空对象时，会返回 `undefined`，而不是空对象。
- `LangChainTextSplitterAdapter` 会跳过空白 chunk，并保持 `chunkIndex` 连续。
- `LangChainSemanticChunkerAdapter` 优先使用 `createDocuments()`，若未提供则回退到 `splitDocuments()`。
- `LangChainSemanticChunkerAdapter` 当前是协议适配器，不等价于对某个官方具体 semantic chunker 类的一对一包装。
- `LangChainRecursiveCharacterTextSplitterAdapter` 是当前默认推荐的文本切分预设。
- `LangChainTokenTextSplitterAdapter` 适合对 token 预算更敏感的场景。
- `LangChainMarkdownTextSplitterAdapter` 适合 markdown 文档的结构化切分场景。
- `LangChainHeaderAwareChunkTransformer` 会优先读取 chunk metadata 中的 header 信息，若没有则回退到 document metadata。
- `LangChainDocumentMetadataExtractor` 只抽取 LangChain 常见 canonical 字段，不会替代 `indexing` 默认 metadata merge 行为。
- `LangChainEmbeddingsAdapter` 接收任意 LangChain embeddings 风格对象，并保持 `Vector.id` 与 `Chunk.id` 一致。
- `LangChainRuntimeRetrieverAdapter` 默认把 `RetrievalRequest.effectiveQuery.query` 映射给第三方 retriever，并在返回结果后复用 runtime 的 `filterRetrievalCandidatesByIndexingFilters()` 再执行一次统一过滤。
- `LangChainRuntimeRetrieverAdapter` 默认把 LangChain 文档 metadata 归一化为 `Chunk.metadata`，再复用 runtime 的 `createIndexingRetrievalCandidate()` 提升 `sourceId`、`hierarchyPath` 等 Phase D canonical 字段。
- `createLangChainBaseRetrieverRuntimeAdapter` 适合直接包裹 LangChain `BaseRetriever` 子类，允许单独注入 `mapQuery()` 与 `mapRunnableConfig()`，但不重复实现 runtime filter / candidate 语义。
- `PgVectorRuntimeRetrieverAdapter` 并行做向量距离召回与 tsvector 关键词召回，按 RRF 融合；SQL 不表达 Phase D filter，融合后再复用 runtime 统一过滤。
- `LangChainRuntimeGeneratorAdapter` 默认优先消费 runtime postprocessor 产出的 `promptContext`；如果没有，再回退到 `query + chunks` 的最小 prompt 拼装。
- `LangChainRuntimeGeneratorAdapter` 默认支持字符串输出以及带 `content` 的 LangChain 风格输出，并会尽量归一化 `response_metadata` / `usage_metadata`。
- `createLangChainChatModelRuntimeGenerator` 适合直接包裹 LangChain `BaseChatModel` 子类，默认输出 `SystemMessage + HumanMessage` 两段式消息，并允许通过 `buildMessages()` 或 `mapCallOptions()` 覆盖 provider 侧格式。
- 当 embeddings 返回数量与 chunks 数量不一致时，`LangChainEmbeddingsAdapter` 会直接报错，避免静默写入错误向量。
- `OpenAIEmbedder` 调用 OpenAI 兼容 `/embeddings`；`apiKey` 优先取构造参数，再回退 `EMBEDDING_API_KEY`，密钥不写进源码。`baseUrl` 必须由调用方显式传入。
- `OpenAIEmbedder` 按返回 `index` 对齐 batch，并校验维度；数量或维度不一致时立即失败。
- `OpenAIRuntimeGenerator` 调用 OpenAI 兼容 `/chat/completions`；`apiKey` 优先取构造参数，再回退 `OPENAI_API_KEY`。`baseUrl` 与 `model` 必须由调用方显式传入。当前 `stream: false`，一次返回完整答案。
- `ChromaVectorStoreAdapter` 接收 Chroma 连接配置，并在首次写入时自动获取或创建目标 collection。
- `ChromaVectorStoreAdapter` 已对齐 `VectorStoreWriteContext` 的签名，但当前不会消费该上下文，也不会主动实现 stale cleanup。
- `ChromaVectorStoreAdapter` 会在单次 `upsert` 前检查向量维度是否一致，避免把明显错误的 batch 发送到 Chroma。
- `ChromaVectorStoreAdapter` 会把不兼容 Chroma metadata 标量约束的嵌套 JSON 值序列化为字符串，以尽量保留信息。
- `PgVectorStoreAdapter` 接收 PostgreSQL 连接配置，并把向量以 pgvector 字面量形式批量写入指定表。
- `PgVectorStoreAdapter` 覆盖写入侧 `upsert`、`deleteByFilter()` 与 `listSourceRecords()`；查询期走独立的 `PgVectorRuntimeRetrieverAdapter`，不把检索协议塞进 `VectorStore`。
- `PgVectorStoreAdapter` 会在单次 `upsert` 前检查向量维度是否一致；如果配置了固定 `dimension`，还会校验 batch 维度是否匹配。
- `PgVectorStoreAdapter` 可选 `ensureTable` 模式会自动创建 `vector` 扩展、schema、table、source / fingerprint / GIN(tsv) 索引，以及 HNSW 余弦索引。
- `PgVectorStoreAdapter` 第一版默认保留 `metadata`、`source_id`、`fingerprint` 字段；`content` 列读取 `Vector.metadata.content`。`runIndexing` 会在 upsert 前把 chunk 原文写入该字段（已有 content 则保留）。直接 `store.upsert()` 必须自行带上 `metadata.content`，否则 pgvector 的 `content` 列为空，关键词召回和生成都会空。
- `VectorStore.close()` 为可选方法。`PgVectorStoreAdapter` 与 `PgVectorRuntimeRetrieverAdapter` 若自己创建了 `pg.Pool`，应通过 `close()` 释放；注入的 client 不会被关闭。
- `Chunk.metadata` 会合并源文档 metadata、split 后文档 metadata 与 `sourceDocumentId` / `chunkIndex`。

## 验证现状

当前已具备：

- `pnpm --filter @monai-ragsdk/adapters test`
- `pnpm --filter @monai-ragsdk/adapters demo`
- 根级 `pnpm run typecheck`

当前测试覆盖：

- loader 映射
- markdown 目录加载
- 自定义目录 loader 映射
- metadata 收敛
- splitter 映射
- semantic chunker 映射
- recursive / token / markdown splitter 预设封装
- header-aware chunk transformer
- canonical metadata extractor
- embedding -> vector 映射
- runtime retriever -> candidate 映射与 filter 复用
- runtime generator -> prompt / answer 映射
- Chroma store upsert 映射与错误路径
- pgvector store upsert / deleteByFilter / listSourceRecords 映射与错误路径
- pgvector runtime retriever 的向量 / 关键词并行召回、RRF 融合与 runtime filter
- Ollama embedding / chat HTTP 映射与重试
- OpenAI 兼容 embedding HTTP 映射、鉴权、必填 `baseUrl`、重试与维度校验
- OpenAI 兼容 chat HTTP 映射、鉴权、必填 `baseUrl` / `model` 与 grounded prompt
- 空白 chunk 跳过与连续编号

## 后续建议

1. 在 LangChain 侧继续补更多 loader adapter，而不是把具体 loader 逻辑写回 `indexing`。
2. 如果要继续扩展 chunker，优先补高频预设封装，而不是为每个 LangChain splitter 都新增一层等价 adapter。
3. 如果要继续扩展 embedder，优先补少量高频 provider 预设，而不是把具体厂商 SDK 直接引入 `indexing`。
4. 当需要继续补 Pinecone 等向量数据库时，继续保持“第三方能力放 adapters，核心契约放 core”的边界。
5. PostgreSQL + pgvector 查询期继续走 `PgVectorRuntimeRetrieverAdapter`，不要把检索协议塞回 `VectorStore`。
6. 当前已具备 `runtime + adapters` 的根级 integration / smoke 最小链路；后续优先在既有场景上扩展更多 adapter 组合，而不是另起一套跨包验证结构。
