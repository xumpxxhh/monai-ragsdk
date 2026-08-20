# `@monai-ragsdk/core` — 现状

> 快照：**2026-08-19** · 状态：**稳定**
> 源码：`packages/core/` · 用法：[README](../../packages/core/README.md)
> 回：[routing.md](./routing.md)

## 1. 定位

全仓共享契约层。Query / Document / Chunk / Vector / RAGResponse、对应 Zod schema、最小检索生成接口和错误基类从这里出去。

其它包可以依赖 `core`；**`core` 不依赖任何 workspace 包**。第三方只依赖 `zod`。

## 2. 边界（现在和以后都不做）

- 不跑索引，不编排检索 / 生成。
- 不接 LLM、向量库或文件加载器。
- 不往本包加 runtime 阶段语义（pre/post-retrieval、budget、scoreKind）。
- 不提前扩散 eval / utils 实现。

## 3. 当前能力

| 分组 | 现状 |
| --- | --- |
| 类型 | `Query`、`Document`、`Chunk`、`Vector`、`RAGResponse`、`RAGCitation` |
| Schema | 同名 `*Schema`；空 query、空 `chunk.id`、缺 citations 等审计字段会拒绝 |
| 接口 | `Retriever.retrieve(query): Promise<Chunk[]>`；`Generator.generate(...)` |
| 错误 | `RAGCoreError`、`ValidationError`、`RetrievalError`、`GenerationError` |
| Pipeline 类型 | `RAGPipeline = (query) => Promise<RAGResponse>`（形状，不是执行器） |

`chunk.id` 会被 citation / selectionTrace 引用，不能是空字符串。

## 4. 关键入口

| 路径 | 职责 |
| --- | --- |
| `src/index.ts` | 包根 barrel |
| `src/spec/` | Zod schema |
| `src/types/` | 与 schema 对齐的 TS 类型 |
| `src/interfaces/` | 最小 Retriever / Generator |
| `src/errors/` | 错误基类 |
| `src/pipeline/types.ts` | `RAGPipeline` 别名 |

被谁用：`observability`、`indexing`、`runtime`、`adapters`、`apps/cli`（以及其它 apps）。

## 5. 测试与脚本

- 单测约 27（schema / errors / exports / pipeline）
- `pnpm --filter @monai-ragsdk/core test`
- demo：`demo:schema`、`demo:errors`、`demo:pipeline`、`demo:runtime-like`

## 6. 已知缺口（不阻塞使用）

**core 与 runtime 各有一套 Retriever / Generator。** core 是 `retrieve(query) → Chunk[]`；runtime 是 `retrieve(request, context) → RuntimeRetrievalResult`。adapters 只认 runtime 侧。实现者不能从 API 面判断该实现哪个——这是契约诊断里的中等项，尚未收敛。

**Filters / Budget 在 core `RAGResponse` 与 runtime 请求类型双份维护**，靠 `assemble-runtime-result` 手工映射。字段增删需两处同步。

不要在本包「补」runtime 阶段字段来消掉双份；收敛方案属于后续工程债，见 [routing.md](./routing.md) 已知缺口。

## 7. 关联

- 诊断： [kernel-contract-defects.md](../decisions/kernel-contract-defects.md)（core/runtime 双接口、Filters/Budget 双份）
- 下游现状：[indexing.md](./indexing.md)、[runtime.md](./runtime.md)
