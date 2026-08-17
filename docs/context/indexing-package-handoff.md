# indexing 包交接文档

## 目的

本文档用于帮助后续 AI 或开发者快速理解 `packages/indexing` 当前已经实现到什么程度、哪些边界已经固定、哪些能力仍然故意留白。

## 当前阶段

`indexing` 当前处于第一版 MVP 实施阶段。

已完成内容：

- 共享模型复用：来自 `@monai-ragsdk/core` 的 `Document`、`Chunk`、`Vector`
- 包内类型：`IndexingContext`、`IndexingResult`、`IndexingOptions`
- 接口抽象：`Loader`、`Chunker`、`DocumentTransformer`、`ChunkTransformer`、`ChunkFilter`、`MetadataExtractor`、`Embedder`、`VectorStore`
- 默认组件：`SimpleChunker`、`ContentCleanupTransformer`、`ContextualHeaderTransformer`、`HashDedupChunkFilter`、`BasicMetadataExtractor`、`MockEmbedder`、`MemoryVectorStore`
- 包内错误：`IndexingError`
- 主流程：`runIndexing`
- 包级 demo：`demo/run-indexing.ts`、`demo/extension-components.ts`
- 包级 unit test：`__tests__/`

未完成内容：

- 外部向量数据库适配
- 真实 embedding 服务适配
- 完整的增量索引、并发、重试
- 更完整的 integration / smoke 覆盖
- 输出格式与 `runtime` 的正式对接协议

当前已补的高级能力保留位：

- `IndexingMode`、`sourceId`、`fingerprint`
- `VectorStoreWriteContext`
- 可选 `VectorStore.deleteByFilter()` 契约
- `hierarchyPath` / `hierarchyDepth` / `parentHierarchyPath` 默认 metadata

## 目录结构

```text
packages/indexing/
  src/
    chunkers/
    chunk-transformers/
    defaults/
    embedders/
    errors/
    filters/
    loaders/
    metadata/
    pipeline/
    stores/
    transformers/
    types/
    index.ts
  __tests__/
  demo/
  README.md
  package.json
  tsconfig.json
```

## 当前公开导出

当前 `src/index.ts` 已统一导出以下类别：

- `types/*`
- `loaders/*`
- `chunkers/*`
- `chunk-transformers/*`
- `filters/*`
- `metadata/*`
- `transformers/*`
- `embedders/*`
- `stores/*`
- `errors/*`
- `defaults/*`
- `pipeline/*`

后续如果继续扩展导出面，应优先保持这个分层结构，不要把实现直接堆到根入口文件里。

## 关键设计约束

### 1. `Document` 与 `Vector` 统一复用 core

当前 `Document`、`Chunk`、`Vector` 都应从 `@monai-ragsdk/core` 复用，`indexing` 不再重复定义这些共享模型。

如果后续共享模型继续扩展，也应优先放在 `core`，再由 `indexing` 消费。

### 2. metadata 必须保持 JSON-safe

`Document.metadata`、`Vector.metadata` 以及 chunk metadata 都要求与 `@monai-ragsdk/core` 的 JSON-safe 约束保持一致。

不要把 `Date`、`Map`、函数等不可序列化对象直接塞进 metadata。

### 3. 具体 loader 保持在 adapters 或业务侧

当前 `indexing` 不再承载具体文件 loader，只保留 `Loader` 接口抽象。

本地 markdown 目录加载这类具体能力，应放在 `adapters` 中，通过 LangChain 或业务方自己的 loader 实现来注入。

不要把浏览器侧、远程存储或文件系统 IO 重新混回 `indexing`；这会破坏当前的包边界。

### 4. `runIndexing` 当前仍以串行为主，但已补齐 chunk 级扩展位

当前主流程按串行方式组织，并已扩展为：

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

当前不追求：

- 并发吞吐
- 失败重试
- 增量更新
- 复杂状态管理

如果后续要引入这些能力，应优先保持当前 API 兼容，而不是直接推翻 `runIndexing`。

补充说明：

- 当前 `runIndexing` 已支持 `sourceIdResolver` 与 `fingerprintResolver`，会把 canonical 值透传到 chunk 级上下文与 store 写入上下文。
- 当前不会主动执行 stale delete；`deleteByFilter()` 只是为后续增量索引预留的可选 store 契约。

### 5. 错误需要保留阶段信息

当前 `IndexingError` 带有 `stage` 字段，并已额外保留 `documentId`、`chunkId`、`mode` 等上下文信息。`runIndexing` 在 loader / transform / filter / chunk / transform-chunk / metadata / extract-metadata / filter-chunk / embed / store 出错时都会尽量保留阶段语义。

后续新增阶段时，应同步更新错误语义与测试覆盖。

## 当前验证现状

当前已覆盖：

- `SimpleChunker` 的 overlap 与边界行为
- `ContentCleanupTransformer`、`ContextualHeaderTransformer`、`HashDedupChunkFilter` 与 `BasicMetadataExtractor` 的默认行为
- `MockEmbedder` 与 `MemoryVectorStore` 的最小行为
- `runIndexing` 的结果统计、metadata 合并、chunk 级扩展点、`sourceId` / `fingerprint` 透传与错误处理
- `IndexingError` 在主流程中的阶段透传

当前命令：

1. `pnpm --filter @monai-ragsdk/indexing build`
2. `pnpm --filter @monai-ragsdk/indexing test`
3. `pnpm --filter @monai-ragsdk/indexing demo`
4. `pnpm --filter @monai-ragsdk/indexing demo:extensions`

## 后续建议顺序

1. 先稳定 `runIndexing` 的新扩展位与 Phase D 保留位行为，尤其是 `metadataBuilder`、`metadataExtractors` 与 canonical source metadata 的协作约束。
2. 如果要进入真正的增量索引实现，优先明确 `deleteByFilter()`、`sourceId` 与 `fingerprint` 的语义，而不是直接把业务逻辑塞进 pipeline。
3. 继续把具体 loader / semantic chunking 能力放在 `adapters`，而不是回写到 `indexing`。
4. 当前已具备 `indexing + runtime` 的根级 integration / smoke 最小链路；后续优先在此基础上扩展更多场景，而不是另起一套跨包验证结构。
