# core 包交接文档

## 目的

本文档用于帮助后续 AI 或开发者快速接手 `packages/core`，理解其当前职责、公开导出面、验证现状与修改边界。

## 当前定位

`core` 是当前仓库中承载共享领域契约的核心 package。

它只负责共享领域契约，不负责 runtime 编排或第三方适配。

当前职责包括：

- 共享 schema
- 共享类型
- 共享接口
- 共享错误模型
- 轻量 pipeline 类型抽象

当前不负责：

- runtime 业务逻辑
- adapters 接入
- indexing 流程编排与默认组件实现
- integration / smoke 级联调

## 当前目录

```text
packages/core/
  src/
    errors/
    interfaces/
    pipeline/
    spec/
    types/
    index.ts
  demo/
  __tests__/
  dist/
  package.json
  tsconfig.json
  README.md
```

目录职责：

- `src/`：只放 `.ts` 源码
- `demo/`：最小可运行验证案例
- `__tests__/`：Vitest 单元测试
- `dist/`：唯一合法构建产物输出目录

## 当前公开导出

统一从 `src/index.ts` 聚合，并构建到 `dist/index.js` / `dist/index.d.ts`。

### spec

- `JsonValueSchema`
- `JsonObjectSchema`
- `QuerySchema`
- `ChunkSchema`
- `DocumentSchema`
- `VectorSchema`
- `RAGResponseSchema`

### types

- `Query`
- `Chunk`
- `Document`
- `Vector`
- `RAGResponse`

### interfaces

- `Retriever`
- `Generator`

### errors

- `RAGCoreError`
- `ValidationError`
- `RetrievalError`
- `GenerationError`

### pipeline

- `RAGPipeline`

## 当前验证现状

`core` 是当前已经稳定具备 build、demo、unit test 的共享契约 package。

### 构建

- `pnpm --filter @monai-ragsdk/core build`

### demo

- `pnpm --filter @monai-ragsdk/core demo:runtime-like`
- `pnpm --filter @monai-ragsdk/core demo:schema`
- `pnpm --filter @monai-ragsdk/core demo:errors`
- `pnpm --filter @monai-ragsdk/core demo:pipeline`

### unit test

- `pnpm --filter @monai-ragsdk/core test`
- `pnpm --filter @monai-ragsdk/core test:watch`

### 根级校验

- `pnpm typecheck`
- `pnpm test`
- `pnpm check`
- `pnpm verify`

## 当前测试覆盖

### schema

重点覆盖：

- `QuerySchema` 的空字符串边界
- `ChunkSchema` 的 metadata 对象边界
- `DocumentSchema` 的基础结构边界
- `VectorSchema` 的数值数组边界
- `RAGResponseSchema` 的 answer 类型边界
- `JsonValueSchema` / `JsonObjectSchema` 的递归与对象边界
- 失败场景的错误路径断言

### errors

重点覆盖：

- 错误子类名称
- 错误继承关系
- `cause` 透传

### pipeline

重点覆盖：

- `Retriever` + `Generator` + `RAGPipeline` 的最小协作路径

### exports

重点覆盖：

- `src` 与 `dist` 的运行时导出面对齐
- 关键 runtime 导出是否暴露
- 公开类型签名的基本稳定性

## 修改边界

允许修改：

- schema 的字段与约束
- 共享类型与接口
- 错误模型与命名
- demo 与 unit test
- 公开导出面

修改时必须同步关注：

- `dist` 导出是否仍然正确
- demo 是否仍然能跑
- unit test 是否仍然通过
- README 与交接文档是否需要更新

暂时不要修改：

- `runtime`、`indexing`、`adapters` 中的实现
- 根级 smoke / integration 结构
- 与 `core` 无关的仓库级约束

## 常见风险

- 只改 `src` 不重新构建，导致 `dist` 导出面过时
- 改了公开导出但没有同步更新 `exports.spec.ts`
- 改了 schema 边界但没有同步更新失败路径断言
- 把 demo 或测试文件误放进 `src/`
- 让 `core` 开始承担 runtime 业务逻辑

## 建议的后续顺序

1. 在 `core` 内继续稳定 schema、错误模型与导出面。
2. 继续保持 `runtime`、`indexing`、`adapters` 对 `core` 公开契约的依赖边界清晰。
3. 如需调整 `core` 公开模型，先评估 `runtime`、`indexing`、`adapters` 以及根级跨包场景是否需要同步更新。
4. 当前根目录已具备最小 integration / smoke 链路；后续如需扩展跨包验证，优先复用既有根级结构，而不是在 `core` 内单独演化联调入口。
