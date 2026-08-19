# `@monai-ragsdk/indexing`

## 定位

离线索引内核。负责把文档切成 chunk、向量化并写入 store，支持增量 skip / replace 与 stale cleanup。

在线问答不在本包；查询编排走 `@monai-ragsdk/runtime`。真实 LLM / pgvector / 目录加载器走 `@monai-ragsdk/adapters`。

## 依赖

- workspace：`core`、`observability`
- 被谁用：`runtime`（`createCollection` 调用 `runIndexing`）、`adapters`、`apps/cli`、`apps/example`

## 流水线

`runIndexing()` 按文档处理：

1. `load`：`Loader.load()` 产出 `Document[]`
2. `transform`：可选 `DocumentTransformer[]`
3. `filter`：`shouldIndex`，默认跳过空内容
4. `chunk`：默认 `SimpleChunker`（size 500 / overlap 50）
5. `transform-chunk`：可选 `ChunkTransformer[]`
6. `extract-metadata`：可选 `MetadataExtractor[]`，再经 `metadataBuilder`
7. `filter-chunk`：可选 `ChunkFilter[]`
8. `embed`：`Embedder` 按 `batchSize`（默认 50）批处理
9. `store`：`VectorStore.upsert()`
10. 增量模式下的 `delete`：fingerprint 变化则 replace；本轮未见的 source 做 stale cleanup

`mode`：

- `full`：每份文档都 embed / upsert
- `incremental`：按 `sourceId` + `fingerprint` 对比。未变化则 skip；同一 source 出现多个 fingerprint 视为脏状态，走 replace。stale cleanup 需要 store 实现 `deleteByFilter()`

缺少 `sourceId` 或 `fingerprint` 时无法跨运行定位旧向量，只能当新文档写入。

## 内置组件

| 角色 | 实现 |
| --- | --- |
| Chunker | `SimpleChunker` |
| Embedder | `MockEmbedder`（离线回退，默认 8 维） |
| Store | `MemoryVectorStore` |
| Transformer | `ContentCleanupTransformer` |
| ChunkTransformer | `ContextualHeaderTransformer` |
| Filter | `HashDedupChunkFilter` |
| Metadata | `BasicMetadataExtractor` |

Loader 只有接口，没有内置实现；目录 / Markdown 加载用 adapters 的 LangChain 适配。

## 使用方式

```ts
import {
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  runIndexing,
} from '@monai-ragsdk/indexing';

const store = new MemoryVectorStore();

const result = await runIndexing({
  mode: 'incremental',
  loader: {
    async load() {
      return [{ id: 'doc-1', content: 'runtime 负责在线编排。' }];
    },
  },
  chunker: new SimpleChunker({ chunkSize: 500, overlap: 50 }),
  embedder: new MockEmbedder({ dimension: 8 }),
  store,
  sourceIdResolver: (document) => document.id,
  fingerprintResolver: (document) => document.content,
});
```

`IndexingResult` 含 `documentsIndexed`、`unchangedDocuments`、`replacedDocuments`、`staleSourcesDeleted`、`failedDocuments` 等计数。单文档失败时：有 `onError` 则隔离后继续，否则抛 `IndexingError`。

把 `observer` 交给 `runIndexing` 后打 indexing 阶段事件。未传 `trace.traceId` 时内核生成为 `indexing:${mode}:${startedAt}`，`traceIdSource` 为 `generated`。runtime 的 UUID 兜底见 [`@monai-ragsdk/runtime` README](../runtime/README.md)。

## 脚本

```bash
pnpm --filter @monai-ragsdk/indexing test
pnpm --filter @monai-ragsdk/indexing demo
pnpm --filter @monai-ragsdk/indexing demo:incremental
pnpm --filter @monai-ragsdk/indexing demo:extensions
```

## 边界

- 不负责 `ask` / 流式生成。
- 不内置 OpenAI、Ollama、pgvector。
- 不要在本包新增第二套存储路径；真实 store 放 adapters。
