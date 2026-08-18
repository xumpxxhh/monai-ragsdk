# `@monai-ragsdk/core`

## 定位

共享契约层。全仓的 Query / Document / Chunk / Vector / RAGResponse、Zod schema、最小检索生成接口和错误基类都从这里出去。

其它包可以依赖 `core`，`core` 不依赖任何 workspace 包。

## 依赖

- workspace：无
- 第三方：`zod`

被谁用：`observability`、`indexing`、`runtime`、`adapters`、`apps/cli`。

## 公开能力

| 分组 | 内容 |
| --- | --- |
| 类型 | `Query`、`Document`、`Chunk`、`Vector`、`RAGResponse`、`RAGCitation` 等 |
| Schema | 同名 `*Schema`，用于 parse / safeParse |
| 接口 | `Retriever.retrieve()`、`Generator.generate()` |
| 错误 | `RAGCoreError`、`ValidationError`、`RetrievalError`、`GenerationError` |
| Pipeline | `RAGPipeline = (query) => Promise<RAGResponse>` |

`Retriever` / `Generator` 只描述最小形状。在线编排请用 `runtime` 的 `RuntimeRetriever` / `RuntimeGenerator`，不要在 `core` 里加阶段语义。

## 使用方式

```ts
import { ChunkSchema, QuerySchema, RAGResponseSchema } from '@monai-ragsdk/core';

const query = QuerySchema.parse({ query: '什么是 runtime？' });
const chunk = ChunkSchema.parse({
  id: 'chunk-1',
  content: 'runtime 负责在线检索与生成编排。',
});

const response = RAGResponseSchema.parse({
  answer: 'runtime 负责在线检索与生成编排。',
  chunks: [chunk],
  originalQuery: query,
  effectiveQuery: query,
  citations: [{ index: 1, chunkId: chunk.id }],
});
```

空 query、空 chunk id、缺少 citations 等审计字段会被 schema 拒绝。`chunk.id` 会被 citation / selectionTrace 引用，不能是空字符串。

## 脚本

在仓库根目录：

```bash
pnpm --filter @monai-ragsdk/core test
pnpm --filter @monai-ragsdk/core demo:schema
pnpm --filter @monai-ragsdk/core demo:errors
pnpm --filter @monai-ragsdk/core demo:pipeline
pnpm --filter @monai-ragsdk/core demo:runtime-like
```

## 边界

- 不跑索引，不编排检索 / 生成。
- 不接 LLM、向量库或文件加载器。
- 不提前扩散 eval / utils 实现。
