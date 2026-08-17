# indexing

## 定位

`indexing` 用于承载离线数据构建流程，把原始文档加工成可供 runtime 检索使用的索引数据。

## 当前目录

- `src/`：源码目录，仅允许放置 `.ts` 源码。
- `src/loaders/`：仅保留 `Loader` 抽象，不内置具体文件 loader。
- `src/chunkers/`：切分器接口与 `SimpleChunker`。
- `src/chunk-transformers/`：chunk 级增强接口与默认 header 上下文增强实现。
- `src/filters/`：chunk 级过滤接口与默认去重实现。
- `src/metadata/`：metadata 抽取接口与默认抽取实现。
- `src/transformers/`：文档转换器接口与默认内容清洗实现。
- `src/embedders/`：Embedder 接口与 `MockEmbedder`。
- `src/stores/`：VectorStore 接口与 `MemoryVectorStore`。
- `src/errors/`：`IndexingError` 与错误导出。
- `src/pipeline/`：`runIndexing` 主流程。
- `src/types/`：`IndexingResult`、`IndexingOptions`、`IndexingContext` 等包内类型，以及对 `core` 共享模型的类型转发。
- `src/index.ts`：统一公开导出入口。
- `demo/`：最小可运行示例。
- `__tests__/`：Vitest 单元测试。
- `dist/`：构建产物输出目录，仅在执行构建后生成。

## 当前状态

当前已完成第一版 MVP 实现：

- 复用 `@monai-ragsdk/core` 的 `Document`、`Chunk`、`Vector`
- `IndexingResult`、`IndexingOptions`、`IndexingContext`
- `Loader`、`Chunker`、`Embedder`、`VectorStore` 接口
- `DocumentTransformer`、`ChunkTransformer`、`ChunkFilter`、`MetadataExtractor`
- `SimpleChunker`
- `ContentCleanupTransformer`
- `ContextualHeaderTransformer`
- `HashDedupChunkFilter`
- `BasicMetadataExtractor`
- `MockEmbedder`
- `MemoryVectorStore`
- `IndexingError`
- `runIndexing`

当前仍不包含：

- 真实云服务或向量数据库适配
- 完整的并发、重试、增量索引实现
- integration 与 smoke

当前已补的高级能力保留位：

- `IndexingMode` 的 `incremental` 模式位
- `sourceIdResolver` 与 `fingerprintResolver`
- `VectorStoreWriteContext` 与可选 `deleteByFilter()` 契约
- `BasicMetadataExtractor` 输出的 `sourceId`、`fingerprint`、`hierarchyPath`、`hierarchyDepth`

## 构建约定

- 对外入口固定指向 `dist/index.js` 与 `dist/index.d.ts`。
- 构建产物必须输出到 `dist/`。
- 不允许把 `.js`、`.d.ts` 等构建产物回写到 `src/`。

## Demo

常用命令：

1. `pnpm --filter @monai-ragsdk/indexing demo`
2. `pnpm --filter @monai-ragsdk/indexing demo:run-indexing`
3. `pnpm --filter @monai-ragsdk/indexing demo:extensions`

demo 会直接传入自定义 `Loader` 实现，演示 `indexing` 如何只消费抽象接口，而不绑定任何具体文件加载方案。

`demo` / `demo:run-indexing` 当前还会通过 `createJsonlTraceExporter()` 把 indexing trace 落到 `demo/.artifacts/run-indexing-trace.jsonl`，并在终端打印文件路径与 JSONL 内容，便于直接检查观测链路是否生效。

`demo:extensions` 会额外演示 `ContentCleanupTransformer`、`ContextualHeaderTransformer`、`HashDedupChunkFilter` 与 `BasicMetadataExtractor` 的组合用法。

## Unit Test

常用命令：

1. `pnpm --filter @monai-ragsdk/indexing test`
2. `pnpm --filter @monai-ragsdk/indexing test:watch`
3. `pnpm test`

当前测试重点：

- `Loader` 注入后的主流程行为
- `SimpleChunker` 的切分与 overlap 行为
- `MockEmbedder` 与 `MemoryVectorStore` 的最小行为
- `runIndexing` 的结果统计、metadata 合并、chunk 级扩展点与错误路径
- 默认的内容清洗、header 上下文增强、去重与 metadata 抽取组件
- `sourceId` / `fingerprint` / `hierarchyPath` 等 Phase D 保留位的透传
- `IndexingError` 的阶段语义在主流程中的传播

## 当前流程

当前 `runIndexing` 已从原始 MVP 扩展为一条兼容旧用法的新流程：

1. `load`
2. `transform`
3. `filter`
4. `chunk`
5. `transform-chunk`
6. `metadata`
7. `extract-metadata`
8. `filter-chunk`
9. `embed`
10. `store`

说明：

- 如果用户不提供 `chunkTransformers`、`metadataExtractors`、`chunkFilters`，当前行为会退化为原有 MVP 流程。
- `metadataBuilder` 仍保留兼容路径；即使引入 `MetadataExtractor`，默认 metadata merge 行为仍然存在。
- 如果用户提供 `sourceIdResolver` 或 `fingerprintResolver`，这些 canonical 值会透传到 metadata extractor 上下文、store 写入上下文，并覆盖 chunk metadata 中的同名旧值。

## Phase D 保留位

当前已为 `Hierarchical Indexing` 与 `Incremental Indexing` 补齐最小契约，但尚未实现完整行为：

- `IndexingOptions` 支持 `sourceIdResolver` 与 `fingerprintResolver`
- `ChunkTransformer`、`ChunkFilter`、`MetadataExtractor` 上下文支持读取 `sourceId` 与 `fingerprint`
- `VectorStore.upsert()` 支持接收可选的 `VectorStoreWriteContext`
- `VectorStore` 支持声明可选的 `deleteByFilter()`，用于未来的 stale cleanup
- `MemoryVectorStore` 已实现 `deleteByFilter()`，用于验证契约而不是替代真实增量索引实现
- `BasicMetadataExtractor` 会输出 `hierarchyPath`、`hierarchyDepth` 与 `parentHierarchyPath`

说明：

- 当前不会自动执行 stale delete。
- 当前不会实现层级召回或 parent-child retrieval。
- 这些保留位的目的，是把未来 Phase D 之后的演进点稳定在公开契约上。

## Loader 边界

- `indexing` 只定义 `Loader` 接口，不再内置本地文件系统 loader。
- 默认的 markdown 目录加载能力当前放在 `@monai-ragsdk/adapters`，由 LangChain loader 适配提供。
- 如果业务方需要其他来源的数据，也应自行实现 `Loader` 或通过 `adapters` 注入第三方 loader，而不是把具体 IO 逻辑写回 `indexing`。
