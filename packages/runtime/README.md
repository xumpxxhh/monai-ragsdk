# runtime

## 定位

`runtime` 用于承载在线 RAG 查询链路的四阶段编排层。

补充文档：

- `docs/runtime/runtime-api-usage-guide.md`：更细的 API 使用说明与接入示例。
- `docs/runtime/runtime-package-requirements-design.md`：职责边界与设计基线。
- `docs/context/runtime-package-handoff.md`：当前包状态、目录与验证交接说明。

## 当前目录

- `src/`：源码目录，仅允许放置 `.ts` 源码。
- `src/index.ts`：源码入口文件。
- `src/types/`：运行时输入输出、阶段结果与上下文类型。
- `src/interfaces/`：四阶段核心接口。
- `src/errors/`：运行时错误边界。
- `src/pipeline/`：`createRuntime()` 与 `runtime.run()` 的主流程实现。
- `src/defaults/`：最小默认件实现。
- `demo/`：最小可运行示例。
- `__tests__/`：最小单元测试。
- `dist/`：构建产物输出目录，仅在执行构建后生成。

## 当前状态

当前已完成 runtime MVP 第一版最小实现，覆盖：

- 四阶段类型与接口
- `createRuntime()` 与 `runtime.run()`
- `NoopQueryPreprocessor`
- `PassthroughRetrievalPostprocessor`
- `createDefaultPostprocessor()`
- 轻量 post-retrieval 策略件：score threshold、predicate filtering、near-duplicate removal、budget trim、source coverage、context ordering
- `RuntimeError`
- 最小 demo 与 unit test

当前仍未覆盖：

- `runtime` 包内不提供第三方默认 retriever / generator 适配；当前 LangChain 查询期适配已放在 `@monai-ragsdk/adapters`
- 流式输出
- 更复杂的 rerank / trim / hooks
- 更完整的 integration / smoke 覆盖

当前根目录已覆盖的跨包验证：

- `runtime + adapters` 查询链路
- `indexing + runtime` 查询链路

## 构建约定

- 对外入口固定指向 `dist/index.js` 与 `dist/index.d.ts`。
- 构建产物必须输出到 `dist/`。
- 不允许把 `.js`、`.d.ts` 等构建产物回写到 `src/`。

## 当前公开导出

当前 `src/index.ts` 统一导出以下分层：

- `types/*`
- `interfaces/*`
- `errors/*`
- `defaults/*`
- `pipeline/*`

最常用的公开 API：

- `createRuntime()`
- `createDefaultRuntime()`
- `createDefaultPostprocessor()`
- `applyScoreThresholdStrategy()`
- `applyCandidatePredicateStrategy()`
- `applyNearDuplicateRemovalStrategy()`
- `applyBudgetTrimStrategy()`
- `applySourceCoverageStrategy()`
- `applyCandidateOrderingStrategy()`
- `RuntimeError`
- `NoopQueryPreprocessor`
- `PassthroughRetrievalPostprocessor`

## API 使用概览

### 1. 最小接入

当你已经有可调用的 retriever 与 generator 时，优先使用 `createDefaultRuntime()`。

```ts
import { createDefaultRuntime } from "@monai-ragsdk/runtime";

const runtime = createDefaultRuntime({
  retriever: {
    async retrieve(request) {
      return {
        candidates: [
          {
            chunk: {
              id: "chunk-1",
              content: `retrieved for: ${request.effectiveQuery.query}`,
            },
            score: 0.99,
          },
        ],
      };
    },
  },
  generator: {
    async generate({ request, chunks }) {
      return {
        answer: `${request.effectiveQuery.query} -> ${chunks.length}`,
      };
    },
  },
});

const result = await runtime.run({ query: "Explain runtime" });
```

默认行为：

- 自动使用 `NoopQueryPreprocessor`
- 自动使用 `PassthroughRetrievalPostprocessor`
- 默认 postprocessor 会优先消费 `request.rerank.minScore` 与 `request.budget`
- 默认 postprocessor 当前会按 `score threshold -> predicate filtering -> near-duplicate removal -> budget trim -> source coverage -> context ordering` 的顺序处理候选

### 1.1 配置默认 post-retrieval

当你需要轻量后处理策略，但又不想自己实现完整 `RetrievalPostprocessor` 时，可以使用 `createDefaultPostprocessor()`。

```ts
import {
  createDefaultPostprocessor,
  createDefaultRuntime,
} from "@monai-ragsdk/runtime";

const runtime = createDefaultRuntime({
  postprocessor: createDefaultPostprocessor({
    scoreThreshold: 0.7,
    nearDuplicateRemovalConfig: {
      enabled: true,
    },
    budget: {
      maxCandidates: 2,
    },
    sourceCoverageConfig: {
      enabled: true,
      maxPerSource: 1,
    },
    debug: true,
  }),
  retriever,
  generator,
});
```

适用场景：

- 你只需要轻量后处理策略，不想自己实现完整 `RetrievalPostprocessor`
- 你希望把去重、source coverage 和排序等默认策略组合到默认 postprocessor 中

### 2. 自定义四阶段

如果需要显式控制 query rewrite、route、候选筛选与 prompt 组装，使用 `createRuntime()`。

关键阶段接口：

- `QueryPreprocessor`
- `RuntimeRetriever`
- `RetrievalPostprocessor`
- `RuntimeGenerator`

关键输入输出类型：

- `RuntimeQueryInput`
- `RetrievalRequest`
- `RetrievalCandidate`
- `RuntimeResult`
- `RuntimeRunOptions`

### 3. 调试与错误

- `runtime.run(input, { includeDebug: true })` 会返回 `debug`
- 任一阶段抛错都会被包装为 `RuntimeError`
- `RuntimeError.stage` 当前包含 `pre-retrieval`、`retrieval`、`post-retrieval`、`generation`
- `debug.selectionTrace` 当前可解释 score threshold、predicate filtering、near-duplicate removal、budget trim、source coverage 与 context ordering 的决策

更完整的类型签名与示例，见 `docs/runtime/runtime-api-usage-guide.md`

## 当前脚本

- `pnpm --filter @monai-ragsdk/runtime build`
- `pnpm --filter @monai-ragsdk/runtime test`
- `pnpm --filter @monai-ragsdk/runtime demo`
- `pnpm --filter @monai-ragsdk/runtime demo:custom`
