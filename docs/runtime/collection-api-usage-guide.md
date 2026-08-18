# Collection API 使用指南（阶段 3 MVP）

本文档说明 `@monai-ragsdk/runtime` 阶段 3 的知识库门面 `Collection`（MVP）。

阶段 3 的目标是提供一套“最小可用”的入口，把既有能力串成闭环：

- `ingest()` 复用 `@monai-ragsdk/indexing` 的 `runIndexing()` 写入向量库；
- `search()` 复用 `@monai-ragsdk/runtime` 的 `runtime.search()` 做 retrieve-only（不调用 generator）；
- `ask()` 复用 `@monai-ragsdk/runtime` 的 `runtime.run()` 做检索与生成；
- 只做编排，不实现完整文档生命周期（阶段 3 仍冻结该范围之外的更完整能力）。

## 一句话职责划分

- `Collection`：串起 `indexing + runtime`，对外提供统一的 `ingest/search/ask` 入口。
- `indexing`：负责切分、embedding、vector store 写入与（按 options 的）增量语义。
- `runtime`：负责 pre-retrieval / retrieval / post-retrieval / generation 的在线链路与 grounding。

## 最小用法

下面示例用内存向量库（`MemoryVectorStore`）演示：

1. `createCollection()`
2. `ingest(documents)`
3. `search(query)` / `ask(query)`

```ts
import {
  createCollection,
  createDefaultRuntime,
} from "@monai-ragsdk/runtime";

import {
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  BasicMetadataExtractor,
} from "@monai-ragsdk/indexing";

const store = new MemoryVectorStore();

const collection = createCollection({
  indexing: {
    mode: "incremental",
    chunker: new SimpleChunker({ chunkSize: 60, overlap: 0 }),
    metadataExtractors: [new BasicMetadataExtractor()],
    embedder: new MockEmbedder({ dimension: 6 }),
    store,
    sourceIdResolver() {
      return "docs/example";
    },
    fingerprintResolver(document) {
      return `fp:${document.id}`;
    },
  },
  runtime: createDefaultRuntime({
    retriever: {
      async retrieve(request) {
        // 这里需要把 store 拉到的向量映射成 runtime 的 RetrievalCandidate。
        // demo / 测试里会用 indexedChunks 映射来取回 chunk.content。
        return { candidates: [], retrievalMetadata: {} };
      },
    },
    generator: {
      async generate({ request, chunks }) {
        return { answer: `answer:${request.effectiveQuery.query}` };
      },
    },
  }),
});

await collection.ingest([
  {
    id: "doc-1",
    content: "hello collection",
    metadata: { title: "Doc1", headerPath: ["collection", "doc-1"] },
  },
]);

const searchResult = await collection.search({ query: "hello?" });
console.log(searchResult.chunks, searchResult.citations);

const askResult = await collection.ask({ query: "hello?" });
console.log(askResult.answer);
```

## `search()` 与 `ask()` 的差异

- `search()`：retrieve-only。只跑 pre-retrieval → retrieval → post-retrieval，**不调用 generator**，因此没有 `answer`。返回检索侧审计快照（`chunks`、`citations`、`originalQuery` / `effectiveQuery`、`counts` 等），用于检索结果可视化或自行再拼 prompt。
- `ask()`：完整四阶段，直接返回 runtime 的 `RuntimeResult`（core 审计快照：`answer`、`chunks`、`citations`、回放/决策具名字段，以及可选 `debug`）。

## 增量状态与清理（更接近产品门面）

阶段 3 MVP 默认不提供复杂文档生命周期 UI，但为了让调用方能做基本运营与回收，`Collection` 在底层 store 支持时提供以下方法：

- `listSources()`：列出当前向量库中存在的 `sourceId / fingerprint` 记录（如果底层 store 不支持，会返回空数组）。
- `deleteByFilters({ sourceIds, fingerprints })`：按条件删除向量（如果底层 store 不支持 `deleteByFilter()`，返回 `false`）。
- `close()`：关闭底层资源（如果 store 支持，返回 `true`；否则返回 `false`）。

并且 `ingest()` 支持覆盖 indexing 级的 `observer / trace / batchSize`，便于把一次 ingestion 的观测与任务隔离到调用链里。

## 与后续阶段的关系

当前 MVP 不提供完整文档生命周期门面（例如按 sourceId/fingerprint 自动触发 delete/replace 的更细策略与文档版本管理 UI）。

如果你计划推进阶段 3 的完整知识库门面，建议下一步先把：

1. `Collection` 与 `indexing` 的增量语义（fingerprint skip/replace、stale cleanup）的“对外契约字段”
2. `Collection` 对外暴露的文档生命周期方法（仍需二次明确授权）

补齐，再考虑更完整的知识库产品化门面。

