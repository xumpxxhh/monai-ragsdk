# adapters

## 定位

`adapters` 用于承载对外部生态能力的适配实现，负责把第三方 loader、splitter、embedding、vector store 等能力转换为当前 SDK 的统一契约。

## 当前目录

- `src/`：源码目录，仅允许放置 `.ts` 源码。
- `src/langchain/`：当前阶段优先实现的 LangChain 适配目录。
- `src/chroma/`：Chroma 向量存储适配目录。
- `src/pgvector/`：PostgreSQL + pgvector 向量存储适配目录。
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
- 对齐 `@monai-ragsdk/core` 的共享模型
- 对齐 `@monai-ragsdk/indexing` 的 `Loader` / `Chunker` 等组件接口
- 对齐 `@monai-ragsdk/runtime` 的 `RetrievalRequest` / `RuntimeRetriever` / `RuntimeGenerator` 查询期契约
- 补充 `demo/` 与 `__tests__/`

当前仍未实现：

- OpenAI embeddings 预设 adapter
- Pinecone adapter
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

推荐优先级：

- 当前优先用 `LangChainEmbeddingsAdapter` 接入第三方 embeddings 实例。
- provider 级预设暂未内置，避免在 MVP 阶段过早固化 OpenAI 等厂商配置面。

## 当前查询期 adapter 策略

- `LangChainRuntimeRetrieverAdapter`：把 LangChain 风格 `invoke()` 检索器适配为 `@monai-ragsdk/runtime` 的 `RuntimeRetriever`，默认复用 runtime 的 indexing metadata 查询协议映射与 filter 过滤逻辑。
- `LangChainRuntimeGeneratorAdapter`：把 LangChain 风格 `invoke()` 生成器适配为 `@monai-ragsdk/runtime` 的 `RuntimeGenerator`，默认优先消费 runtime postprocessor 产出的 `promptContext`。
- `createLangChainBaseRetrieverRuntimeAdapter`：面向真实 LangChain `BaseRetriever` 实例的更薄封装，默认把 `RetrievalRequest` 映射到 `BaseRetriever.invoke(query, config)`，并继续复用 runtime 的候选映射与 filter 语义。
- `createLangChainChatModelRuntimeGenerator`：面向真实 LangChain `BaseChatModel` 实例的更薄封装，默认把 runtime 输入映射成 `SystemMessage + HumanMessage`，再调用 `model.invoke(messages, options)`。

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
- `PgVectorStoreAdapter`：接收 PostgreSQL 连接配置，并把 `@monai-ragsdk/core` 的 `Vector` 批量写入 pgvector 表。

推荐优先级：

- 当前优先支持本地 / 自建 Chroma Server 的写入场景。
- 当前优先支持 PostgreSQL + pgvector 的写入场景。
- 当前 Chroma adapter 仍只覆盖写入侧 `upsert`；查询期抽象统一通过 `@monai-ragsdk/runtime` 契约对接，不在 Chroma adapter 内部单独扩散查询协议。
- 当前 PgVector adapter 也只覆盖写入侧 `upsert` 与 `deleteByFilter()`；查询期抽象不在 adapter 内部单独扩散。
- 当前已对齐 `VectorStoreWriteContext` 的接口签名，但不会主动实现 `deleteByFilter()` 或 stale cleanup 行为。
- `PgVectorStoreAdapter` 第一版默认保留 `metadata`、`source_id`、`fingerprint` 字段；`content` 仅在 `Vector.metadata.content` 存在时做尽力写入。
- 如果业务方使用其他向量数据库，仍可自行实现 `@monai-ragsdk/indexing` 的 `VectorStore` 接口。

## 当前脚本

- `pnpm --filter @monai-ragsdk/adapters build`
- `pnpm --filter @monai-ragsdk/adapters test`
- `pnpm --filter @monai-ragsdk/adapters demo`
- `pnpm --filter @monai-ragsdk/adapters demo:chroma-store`
- `pnpm --filter @monai-ragsdk/adapters demo:langchain-extensions`
- `pnpm --filter @monai-ragsdk/adapters demo:langchain-runtime`

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
