# core

## 定位

`core` 提供 MonAI RAG SDK 的共享领域契约。

## 当前目录

- `src/`：源码目录，仅允许放置 `.ts` 源码。
- `__tests__/`：Vitest 单元测试目录。
- `src/spec/`：共享数据模型的 Zod schema。
- `src/types/`：由 schema 推导出的核心类型。
- `src/interfaces/`：跨包能力接口。
- `src/errors/`：共享错误模型。
- `src/pipeline/`：轻量 pipeline 抽象。
- `src/index.ts`：唯一源码入口。
- `dist/`：构建产物输出目录，包含 `.js` 与 `.d.ts`。

## 当前状态

当前已完成第一批共享契约实现：

- `JsonValueSchema`、`JsonObjectSchema`
- `QuerySchema`、`ChunkSchema`、`RAGResponseSchema`
- `Query`、`Chunk`、`RAGResponse`
- `Retriever`、`Generator`
- `RAGCoreError`、`ValidationError`、`RetrievalError`、`GenerationError`
- `RAGPipeline` 类型占位
- `demo/` 最小运行示例
- `__tests__/` 最小单元测试

当前仍不包含：

- runtime 业务逻辑
- 外部 SDK 接入
- integration 与 smoke

## 当前导出面

当前 `@monai-ragsdk/core` 对外导出按以下分层组织：

- `spec`：`JsonValueSchema`、`JsonObjectSchema`、`QuerySchema`、`ChunkSchema`、`RAGResponseSchema`
- `types`：`Query`、`Chunk`、`RAGResponse`
- `interfaces`：`Retriever`、`Generator`
- `errors`：`RAGCoreError`、`ValidationError`、`RetrievalError`、`GenerationError`
- `pipeline`：`RAGPipeline`

所有导出统一经由 `src/index.ts` 聚合，并构建到 `dist/index.js` / `dist/index.d.ts`。

## 构建约定

- 对外消费入口固定指向 `dist/index.js` 与 `dist/index.d.ts`。
- `src/` 只允许保留 `.ts` 源码，不允许写入 `.js`、`.d.ts` 等构建产物。
- 执行 `pnpm --filter @monai-ragsdk/core build` 后，所有构建产物统一输出到 `dist/`。

## Demo 验证

当前 `core` 已补充最小 demo 验证案例，统一放在 `demo/` 目录，而不是 `src/`。

- `demo/runtime-like.ts`：验证 `Retriever`、`Generator`、`Query`、`RAGResponse` 的最小协作路径。
- `demo/schema-parse.ts`：验证 `QuerySchema`、`ChunkSchema`、`RAGResponseSchema` 的成功与失败边界。
- `demo/error-cases.ts`：验证 `RAGCoreError` 及各错误子类的层级关系。
- `demo/pipeline-like.ts`：验证 `RAGPipeline` 类型可承载最小闭环实现。

建议执行顺序：

1. `pnpm --filter @monai-ragsdk/core build`
2. `pnpm --filter @monai-ragsdk/core demo:runtime-like`
3. `pnpm --filter @monai-ragsdk/core demo:schema`
4. `pnpm --filter @monai-ragsdk/core demo:errors`
5. `pnpm --filter @monai-ragsdk/core demo:pipeline`

## Unit Test

当前 `core` 已补充最小 Vitest 单元测试，覆盖以下重点：

- schema 成功/失败边界
- `JsonValueSchema` / `JsonObjectSchema` 的递归与对象边界
- 错误继承关系与 `cause` 透传
- 最小 pipeline 协作路径
- `src` 与 `dist` 导出面对齐检查

常用命令：

1. `pnpm --filter @monai-ragsdk/core test`
2. `pnpm --filter @monai-ragsdk/core test:watch`
3. `pnpm test`

## 维护说明

- 修改公开导出前，先检查 `__tests__/exports.spec.ts` 是否需要同步更新。
- 修改 schema 边界前，先检查 `__tests__/schema.spec.ts` 的错误路径与递归边界断言。
- 如果新增公开契约，优先同步补 `demo/` 或 `__tests__/`，避免只改实现不改验证。
- 如果需要了解更完整的上下文，先阅读 `docs/context/core-package-handoff.md`。
