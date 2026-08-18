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
- `src/types/`：跨阶段共享契约（输入输出、上下文、`RuntimeStrategyModel`）。
- `src/stages/`：按 pipeline 阶段组织的 interface、默认件与策略件。
  - `pre-retrieval/`、`retrieval/`、`post-retrieval/`、`generation/`
- `src/errors/`：运行时错误边界。
- `src/pipeline/`：`createRuntime()`、`createDefaultRuntime()` 与 `run()` / `runStream()` 主流程。
- `src/indexing/`：indexing 查询协议 helper。
- `demo/`：最小可运行示例（含 `strategy-pipeline.ts`）。
- `__tests__/`：最小单元测试。
- `dist/`：构建产物输出目录，仅在执行构建后生成。

## 当前状态

当前已完成 runtime MVP 与 pipeline 策略框架，覆盖：

- 四阶段类型与接口
- `createRuntime()` 与 `runtime.run()` / `runtime.runStream()`
- `NoopQueryPreprocessor`
- `PassthroughRetrievalPostprocessor`（内部委托可组合策略链）
- `createDefaultPostprocessor()`
- 可组合策略框架：`StrategyQueryPreprocessor`、`StrategyRetrievalPostprocessor`、`FanOutRetriever`、`fuseByReciprocalRankFusion`
- pre-retrieval LLM 策略：`createQueryRewriteStrategy`、`createQueryExpansionStrategy`、`createQueryDecompositionStrategy`、`createMultiQueryStrategy`
- 轻量 post-retrieval 策略件：score threshold、predicate filtering、near-duplicate removal、budget trim、source coverage、context ordering、Lost in the Middle
- `RuntimeStrategyModel` 契约
- `RuntimeError`
- 最小 demo 与 unit test
- 流式输出：`runtime.runStream()`；无 `generateStream` 时回退为一次完整 `generate()`
- citation / grounding：`RuntimeResult.citations` 按进入 generation 的 chunks 生成；`run()` 与 `runStream()` 同构
- 全流程审计快照：`run()` / `runStream()` 始终写入 core `RAGResponse` 具名字段（counts / filters / budget / retrievedCandidates / timings / traceId 等）；`includeDebug` 仍只控制是否附带完整 `debug` 过程对象

当前仍未覆盖：

- `runtime` 包内不提供第三方默认 retriever / generator 适配；当前 LangChain 查询期适配已放在 `@monai-ragsdk/adapters`
- Query Routing、真实 rerank、context compression、Active RAG 循环
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
- `errors/*`
- `stages/*`
- `indexing/*`
- `pipeline/*`

最常用的公开 API：

- `createRuntime()`
- `createDefaultRuntime()`
- `runtime.run()` / `runtime.runStream()`
- `buildRuntimeCitations()`
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

for await (const event of runtime.runStream({ query: "Explain runtime" })) {
  if (event.type === "delta") {
    process.stdout.write(event.text);
  }
}
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
