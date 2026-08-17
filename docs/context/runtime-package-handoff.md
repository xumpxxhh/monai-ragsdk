# runtime 包交接文档

## 目的

本文档用于帮助后续接手 `packages/runtime` 的 AI 或开发者快速理解当前实现边界、公开 API、目录职责与验证现状。

## 当前定位

`runtime` 当前定位为：

**面向 SDK 的在线 RAG 四阶段编排层。**

它负责：

- 收敛 `pre-retrieval -> retrieval -> post-retrieval -> generation` 四阶段主流程
- 统一 `runtime.run()` 的输入、上下文、结果与错误边界
- 提供最小默认件，帮助调用方快速组装在线查询链路

它不负责：

- 离线索引构建
- 第三方生态的具体 retriever / generator 适配
- 流式输出、复杂 hooks、正式 observability / eval 对接

## 当前已实现范围

当前 `runtime` MVP 已完成：

- 四阶段核心接口与运行时类型
- `createRuntime()`
- `createDefaultRuntime()`
- `runtime.run()` 的主流程编排
- `RuntimeError` 与阶段错误包装
- `NoopQueryPreprocessor`
- `PassthroughRetrievalPostprocessor`
- `createDefaultPostprocessor()`
- runtime 级 demo 与 unit test

当前已进入 Phase D 第一批实现：

- 已补 `RetrievalFilters`、`RetrievalBudget`、`RetrievalRerankPolicy`
- 已补 `RetrievalRequest` 的 query policy、budget、indexingMode 与 indexing metadata filter 语义
- 已补 `RetrievalCandidate` 的 `sourceId` / `fingerprint` / 层级路径显式字段
- 已补 `PostRetrievalResult` 的 `selectedCandidates` / `droppedCandidates` 与裁剪结果字段
- 已补 `RuntimeDebugInfo` 的 route、rewrite、budget、threshold 与 selection 计数
- 已补 indexing 查询协议 helper，用于把 indexing canonical metadata 真正映射到 runtime 请求与候选结构
- 已补第一版可复用 post-retrieval 策略件：score threshold、predicate filtering、near-duplicate removal、budget trim、source coverage、context ordering 与 selection trace

当前仍未覆盖：

- `runtime` 包内不提供官方默认的第三方 retriever / generator adapter；当前 LangChain 查询期适配实现已放在 `@monai-ragsdk/adapters`
- 流式输出
- 复杂 rerank / trim 策略集合
- 更完整的 integration / smoke 级跨包验证覆盖

当前根级已覆盖的跨包验证：

- `runtime + adapters` 查询链路
- `indexing + runtime` 查询链路

## 目录结构

```text
packages/runtime/
  src/
    index.ts
    types/
    interfaces/
    errors/
    defaults/
    pipeline/
  demo/
  __tests__/
  README.md
  package.json
  tsconfig.json
```

目录职责：

- `src/types/`：运行时输入输出、上下文、阶段结果
- `src/interfaces/`：四阶段接口
- `src/errors/`：运行时错误边界与包装
- `src/defaults/`：最小默认件
- `src/pipeline/`：`createRuntime()` 与 `runRuntime()`
- `demo/`：最小可运行示例
- `__tests__/`：公开导出、默认件和主流程测试

## 当前公开导出

包入口 `src/index.ts` 当前统一导出：

- `types/*`
- `interfaces/*`
- `errors/*`
- `defaults/*`
- `pipeline/*`

最常用的公开 API：

- `createRuntime()`
- `createDefaultRuntime()`
- `createDefaultPostprocessor()`
- `applyCandidatePredicateStrategy()`
- `applyCandidateOrderingStrategy()`
- `applyNearDuplicateRemovalStrategy()`
- `applySourceCoverageStrategy()`
- `applyScoreThresholdStrategy()`
- `applyBudgetTrimStrategy()`
- `createIndexingRetrievalFilters()`
- `createIndexingRetrievalRequest()`
- `createIndexingRetrievalCandidate()`
- `filterRetrievalCandidatesByIndexingFilters()`
- `RuntimeError`
- `NoopQueryPreprocessor`
- `PassthroughRetrievalPostprocessor`

## 关键类型与接口

最重要的运行时类型：

- `RuntimeQueryInput`
- `RetrievalFilters`
- `RetrievalBudget`
- `RetrievalRerankPolicy`
- `RetrievalRequest`
- `RetrievalCandidate`
- `RuntimeResult`
- `RuntimeRunOptions`
- `RuntimeContext`

最重要的阶段接口：

- `QueryPreprocessor`
- `RuntimeRetriever`
- `RetrievalPostprocessor`
- `RuntimeGenerator`

更完整的调用说明见 `docs/runtime/runtime-api-usage-guide.md`。

## 依赖边界

- `runtime` 依赖 `@monai-ragsdk/core` 中的 `Query`、`Chunk`、`JsonValue` 与基础错误边界
- `runtime` 不应重定义共享查询模型，也不应直接吞并 `indexing` 的离线职责
- 查询期第三方适配应放在 `adapters`，而不是直接写进 `runtime`

## 实现要点

- `createRuntime()` 只做四阶段组装，不额外隐藏行为
- `createDefaultRuntime()` 只为 `preprocessor` 与 `postprocessor` 提供默认件
- `runtime.run()` 会统一创建 `RuntimeContext`，顺序执行四阶段，并在失败时包装为 `RuntimeError`
- `debug` 返回值默认关闭，仅在 `includeDebug = true` 时输出，当前已能反映 route、rewrite、budget、threshold 与 selection 信息
- `promptContext` 当前固定为 `string | undefined`
- 默认 `PassthroughRetrievalPostprocessor` 当前已可消费 request 里的 score threshold 与 budget，并支持 candidate predicate、near-duplicate removal、source coverage、context ordering 与 selection trace

## 当前 Phase D 落地点

当前已经优先在 `runtime` 内落了以下 Phase D 设计：

- 查询协议映射：把 indexing Phase D 关心的 `sourceId`、`fingerprint`、层级 metadata 与 `IndexingMode` 映射进运行时请求和候选结构
- 前处理策略位：把 filter、budget、rerank 和 indexingMode 收敛到 `RetrievalRequest`
- 后处理选择结果：允许 postprocessor 返回 selected/dropped candidates 和实际应用的裁剪参数
- 调试信息：允许 runtime 对外暴露 selection count、route、rewriteReason 和 budget / threshold 信息
- 公共 helper：允许 preprocessor、retriever 与未来 adapters 复用同一套 indexing metadata 映射与过滤逻辑
- 通用策略件：允许 runtime 与未来 adapters 复用同一套厂商无关的 post-retrieval score threshold / predicate filtering / near-duplicate removal / budget trim / source coverage / context ordering 逻辑

当前仍未落地：

- 更完整的 rerank / trim 默认策略集合

本轮新增的 Phase 1 增量点：

- 默认 post-retrieval 工厂：`createDefaultPostprocessor()`
- 轻量 predicate filtering：允许复用 `RetrievalCandidate`、`RetrievalRequest` 与 `RuntimeContext` 做候选过滤
- 轻量 context ordering：允许在最终 selected candidates 上做稳定排序，并把排序结果写入 selection trace
- 更丰富的 selection trace：允许补充 `stage`、`score`、`order` 等解释信息

本轮新增的 Phase 2 轻量策略点：

- near-duplicate removal：优先按 `fingerprint` 精确去重，没有 `fingerprint` 时退回轻量文本近重复判断
- source coverage：以 `maxPerSource + balanced` 的轻量语义限制单一 source 独占候选
- 更完整的 selection trace：允许记录 duplicate/source coverage 的 dropped reason 与解释 metadata

已由 `@monai-ragsdk/adapters` 落地的相关能力：

- `LangChainRuntimeRetrieverAdapter`
- `LangChainRuntimeGeneratorAdapter`
- `createLangChainBaseRetrieverRuntimeAdapter`
- `createLangChainChatModelRuntimeGenerator`

## 当前验证现状

当前已经具备并通过：

- `pnpm --filter @monai-ragsdk/runtime build`
- `pnpm --filter @monai-ragsdk/runtime test`
- `pnpm --filter @monai-ragsdk/runtime demo`
- `pnpm --filter @monai-ragsdk/runtime demo:custom`

根级脚本当前也已纳入：

- `pnpm test`
- `pnpm test:runtime`

## 后续推进建议

进入 Phase D 之前，建议优先遵守以下原则：

- 保持 `runtime` 仍是编排层，不要提前塞入第三方厂商实现
- 如果需要 richer retrieval 语义，优先扩展 `RetrievalRequest`、`RetrievalCandidate` 或 `PostRetrievalResult`
- 如果需要更复杂策略，优先通过自定义 `preprocessor` / `postprocessor` 实现，而不是破坏四阶段结构
- 如果文档与代码状态不一致，优先更新 `README`、本交接文档与 API 使用文档
