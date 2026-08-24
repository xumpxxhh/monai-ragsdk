# `@monai-ragsdk/indexing` — 现状

> 快照：**2026-08-20** · 状态：**可用**
> 源码：`packages/indexing/` · 用法：[README](../../packages/indexing/README.md)
> 回：[routing.md](./routing.md)

## 1. 定位

离线索引内核。把文档切成 chunk、向量化并写入 store，支持增量 skip / replace 与 stale cleanup。

在线问答不在本包；查询编排走 [runtime](./runtime.md)。真实 LLM / pgvector / 目录加载器走 [adapters](./adapters.md)。

依赖：`core`、`observability`。**不依赖 runtime**（反向泄漏不存在）。

被谁用：`runtime`（`createCollection().ingest()` 调 `runIndexing`）、`adapters`、`apps/cli`、`apps/example`。

## 2. 边界

- 不负责 `ask` / 流式生成。
- 不内置 OpenAI、Ollama、pgvector。
- 不要在本包新增第二套存储路径；真实 store 放 adapters。
- Loader 只有接口，没有内置实现。

## 3. 当前流水线

`runIndexing()` 按文档：

1. `load` — `Loader.load()` → `Document[]`
2. `transform` — 可选 `DocumentTransformer[]`
3. `filter` — `shouldIndex`，默认跳过空内容
4. `chunk` — 默认 `SimpleChunker`（size 500 / overlap 50）
5. `transform-chunk` — 可选 `ChunkTransformer[]`
6. `extract-metadata` — 可选 `MetadataExtractor[]`，再经 `metadataBuilder`
7. `filter-chunk` — 可选 `ChunkFilter[]`
8. `embed` — `Embedder` 按 `batchSize`（默认 50）批处理
9. `store` — `VectorStore.upsert()`
10. 增量模式下的 `delete` — fingerprint 变化则 replace；本轮未见的 source 做 stale cleanup

`mode`：

| 模式          | 行为                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `full`        | 每份文档都 embed / upsert                                                                                                                              |
| `incremental` | 按 `sourceId` + `fingerprint` 对比。未变化 skip；同一 source 多个 fingerprint 视为脏状态，走 replace。stale cleanup 需要 store 实现 `deleteByFilter()` |

缺少 `sourceId` 或 `fingerprint` 时无法跨运行定位旧向量，只能当新文档写入。

单文档失败：有 `onError` 则隔离后继续，否则抛 `IndexingError`。

未传 `trace.traceId` 时内核生成为 `indexing:${mode}:${startedAt}`，`traceIdSource` 为 `generated`。

## 4. 内置组件 vs 接口

| 角色             | 内置                          | 说明                                                                                    |
| ---------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| Chunker          | `SimpleChunker`               | 固定大小 + overlap                                                                      |
| Chunker          | `HeadingBasedChunker`         | 按 Markdown 标题切 section（纯 TS）                                                     |
| Chunker          | `ParentChildChunker`          | 标题 section 为 parent，section 内再切 child；metadata 含 `chunkRole` / `parentChunkId` |
| Embedder         | `MockEmbedder`                | 离线回退，默认 8 维                                                                     |
| Store            | `MemoryVectorStore`           | 进程内                                                                                  |
| Transformer      | `ContentCleanupTransformer`   | 文档清洗                                                                                |
| ChunkTransformer | `ContextualHeaderTransformer` | 上下文感知 / 标题注入                                                                   |
| Filter           | `HashDedupChunkFilter`        | 哈希去重                                                                                |
| Metadata         | `BasicMetadataExtractor`      | 基础抽取                                                                                |
| Loader           | **无**                        | PDF / Web / 目录 / Markdown 用 [adapters](./adapters.md) 的 LangChain 适配              |

`VectorStore` 已声明可选 `deleteByFilter?` / `listSourceRecords?` / `close?`。runtime 的 `createCollection` 直接探测这些方法。

## 5. 目录与关键入口

源码按流水线阶段分组（与 [runtime](./runtime.md) 的 `stages/` 叙事对齐）：

```
src/
  pipeline/          run-indexing、incremental、批处理默认值
  stages/
    load/              Loader 契约
    document/          DocumentTransformer、shouldIndex 默认
    chunk/             Chunker、ChunkTransformer
    enrich/            MetadataExtractor、metadataBuilder 默认
    filter/            ChunkFilter
    embed/             Embedder
    store/             VectorStore
  types/               IndexingOptions / Result / Context
  errors/
```

| 路径                               | 职责                   |
| ---------------------------------- | ---------------------- |
| `src/pipeline/run-indexing.ts`     | 主流程                 |
| `src/pipeline/incremental.ts`      | skip / replace / stale |
| `src/stages/store/vector-store.ts` | 存储契约               |
| `src/stages/load/loader.ts`        | 加载契约（无默认实现） |

## 6. 测试与脚本

- 单测约 35（run-indexing / incremental / components / observer / chunker / heading / parent-child）
- `pnpm --filter @monai-ragsdk/indexing test`
- demo：`demo`、`demo:incremental`、`demo:extensions`

## 7. 对照能力地图（refer.md）

| 条目                                                   | 现状                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 文档清洗、元数据、固定切分、稠密向量、增量、元数据关联 | **已落地**                                                                                             |
| 递归 / 语义 / Markdown / 代码 / 句子切分               | **在 adapters**（LangChain），本包不重复实现                                                           |
| 按标题结构切分（无 LangChain）                         | **已落地**（`HeadingBasedChunker`）                                                                    |
| 上下文感知 embedding（header 注入）                    | **已落地**（`ContextualHeaderTransformer`）                                                            |
| 混合索引 / 稀疏编码                                    | **不在本包**；查询期 hybrid 在 pgvector adapter                                                        |
| 多模态解析                                             | **未做**                                                                                               |
| 父子/分级块                                            | **已落地**（`ParentChildChunker`；召回侧按 `chunkRole` / hierarchy 过滤由 app 或 runtime filter 消费） |
| 向量索引策略（HNSW 等）                                | 交给底层 store，本包不抽象                                                                             |

## 8. 已知缺口

- **查询期类型泄漏：** runtime 的 `RetrievalRequest.indexingMode`、`RetrievalCandidate.sourceId` / `fingerprint` 出现在查询链路上；另有 `packages/runtime/src/indexing/` 与本包命名冲突。诊断列为中等项，尚未拆。
- Loader 必须由调用方或 adapters 提供，demo / Collection 用临时 in-memory Loader。

## 9. 关联

- 在线查询协议（按 sourceId / fingerprint / hierarchy 过滤候选）在 runtime 的 `/contract`，不在本包
- [runtime.md](./runtime.md) · [adapters.md](./adapters.md) · [refer.md](../refer.md)
