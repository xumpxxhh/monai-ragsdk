# runtime API 使用文档

## 目的

本文档用于说明 `@monai-ragsdk/runtime` 当前 MVP 的公开 API、典型接入方式与阶段扩展约束，供进入 Phase D 之前的开发实现直接参考。

本文档聚焦“怎么用”。

- 如果需要了解 `runtime` 的职责边界与设计取舍，优先阅读 `docs/runtime/runtime-package-requirements-design.md`
- 如果需要快速了解当前包状态、目录与验证现状，优先阅读 `docs/context/runtime-package-handoff.md`

## 当前能力范围

当前 `runtime` 已提供：

- 四阶段在线编排：`pre-retrieval -> retrieval -> post-retrieval -> generation`
- 公开入口：`createRuntime()`、`createDefaultRuntime()`、`runtime.run()`、`runtime.runStream()`
- 最小默认件：`NoopQueryPreprocessor`、`PassthroughRetrievalPostprocessor`、`createDefaultPostprocessor()`
- 查询期结构化结果：`RetrievalRequest`、`RetrievalCandidate`、`PostRetrievalResult`、`RuntimeResult`、`RuntimeCitation`
- Phase D 第一批查询协议扩展：`RetrievalFilters`、`RetrievalBudget`、`RetrievalRerankPolicy`
- 第一版可复用 post-retrieval 策略件：`applyScoreThresholdStrategy()` 等，以及 `create*Strategy()` 工厂
- 可组合 pipeline 策略框架：`QueryStrategy`、`PostRetrievalStrategy`、`StrategyQueryPreprocessor`、`StrategyRetrievalPostprocessor`、`FanOutRetriever`、`fuseByReciprocalRankFusion`、`createLostInTheMiddleStrategy()`
- `RuntimeStrategyModel` 契约（OpenAI / Ollama 实现在 `@monai-ragsdk/adapters`）
- `RetrievalRequest.subQueries` 供 multi-query fan-out
- 统一错误边界：`RuntimeError`
- 最小 demo 与 unit test

当前仍未提供：

- `runtime` 包内的第三方默认 retriever / generator 适配；当前 LangChain 查询期适配已放在 `@monai-ragsdk/adapters`
- 复杂 rerank / budget trim / hooks
- 与 `eval`、`observability` 的正式对接

## 公开入口概览

`@monai-ragsdk/runtime` 当前从包入口统一导出以下分层：

- `types/*`
- `errors/*`
- `stages/*`（四阶段 interface、默认件与策略件）
- `indexing/*`
- `pipeline/*`

最常用的入口有：

- `createRuntime(options)`：显式传入四阶段实现，适合自定义链路
- `createDefaultRuntime(options)`：只要求传入 `retriever` 与 `generator`，适合最小可运行接入
- `createIndexingRetrievalFilters()`：把 indexing Phase D 的 metadata 过滤意图规范化为 runtime filters
- `createIndexingRetrievalRequest()`：构建与 indexing canonical metadata 对齐的 `RetrievalRequest`
- `createIndexingRetrievalCandidate()`：把 chunk metadata 映射成显式 `RetrievalCandidate`
- `filterRetrievalCandidatesByIndexingFilters()`：按 `RetrievalFilters` 过滤并标注命中的候选
- `createDefaultPostprocessor()`：按轻量选项构建默认 post-retrieval 实现
- `applyScoreThresholdStrategy()`：按候选 score 执行阈值过滤
- `applyCandidatePredicateStrategy()`：按自定义 predicate 过滤候选
- `applyNearDuplicateRemovalStrategy()`：按 `fingerprint` 或轻量文本相似度移除近重复候选
- `applyBudgetTrimStrategy()`：按 `RetrievalBudget` 执行候选数、chunk 数与 prompt 长度裁剪
- `applySourceCoverageStrategy()`：按 source 配额控制最终候选覆盖
- `applyCandidateOrderingStrategy()`：按自定义 comparator 稳定排序最终候选
- `buildRuntimeCitations()`：把 post-retrieval chunks 转成 `RuntimeResult.citations`
- `RuntimeError`：统一捕获任一阶段的运行时失败

## 最小接入

如果你只想尽快跑通一条在线查询链路，优先使用 `createDefaultRuntime()`。

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
        retrievalMetadata: {
          provider: "demo",
        },
      };
    },
  },
  generator: {
    async generate({ request, chunks }) {
      return {
        answer: `${request.effectiveQuery.query} -> ${chunks[0]?.content ?? "no chunk"}`,
        generationMetadata: {
          provider: "demo",
        },
      };
    },
  },
});

const result = await runtime.run({ query: "Explain runtime MVP" });
```

需要边生成边消费 token 时，使用 `runtime.runStream()`。没有 `generateStream` 的 generator 会把完整 `generate()` 结果当成一次 delta。

```ts
for await (const event of runtime.runStream({ query: "Explain runtime MVP" })) {
  if (event.type === "delta") {
    process.stdout.write(event.text);
    continue;
  }

  console.log(event.result.answer);
}
```

这里的默认行为是：

- `NoopQueryPreprocessor` 会把输入 query 原样转成 `RetrievalRequest`
- `PassthroughRetrievalPostprocessor` 会直接把候选结果中的 `chunk` 透传为最终 `chunks`
- 如果存在候选结果，会自动拼出一个最小 `promptContext`
- 默认 postprocessor 会优先消费 `request.rerank.minScore` 与 `request.budget`，自动应用 score threshold、budget trim 和 selection trace

## 配置默认 post-retrieval

如果你希望继续使用默认 postprocessor，但又需要固定阈值、固定预算、自定义 predicate、近重复去重、source coverage 或排序逻辑，可以使用 `createDefaultPostprocessor()`。

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
    candidatePredicate: ({ candidate }) => candidate.sourceId !== "docs/ignore",
    orderCandidates: (left, right) => (right.score ?? 0) - (left.score ?? 0),
    debug: true,
  }),
  retriever,
  generator,
});
```

适用场景：

- 你只需要轻量后处理策略，不想自己实现完整 `RetrievalPostprocessor`
- 你希望把 score threshold、predicate filtering、near-duplicate removal、budget trim、source coverage 与 context ordering 组合到默认 postprocessor 中

## 完整自定义接入

如果你希望显式控制 query rewrite、路由、候选筛选或 prompt 组装，使用 `createRuntime()`。

```ts
import {
  PassthroughRetrievalPostprocessor,
  createIndexingRetrievalCandidate,
  createIndexingRetrievalFilters,
  createIndexingRetrievalRequest,
  createRuntime,
  filterRetrievalCandidatesByIndexingFilters,
} from "@monai-ragsdk/runtime";

const runtime = createRuntime({
  preprocessor: {
    async preprocess(input) {
      return createIndexingRetrievalRequest({
        originalQuery: { query: input.query },
        effectiveQuery: { query: `${input.query} site:docs` },
        route: "docs-only",
        rewriteReason: "prefer docs corpus",
        topK: 2,
        strategy: "metadata-first",
        indexingMode: "incremental",
        filters: createIndexingRetrievalFilters({
          sourceIds: ["docs/runtime"],
          hierarchyPath: ["runtime", "api"],
        }),
        budget: {
          maxCandidates: 4,
          maxChunks: 1,
        },
        rerank: {
          strategy: "score-threshold",
          minScore: 0.7,
        },
        metadata: input.metadata,
      });
    },
  },
  retriever: {
    async retrieve(request) {
      const candidates = [
        createIndexingRetrievalCandidate(
          {
            id: "doc-1",
            content: `candidate 1 for ${request.effectiveQuery.query}`,
            metadata: {
              sourceId: "docs/runtime",
              fingerprint: "fp-1",
              hierarchyPath: ["runtime", "api"],
              parentHierarchyPath: ["runtime"],
              hierarchyDepth: 2,
            },
          },
          {
            score: 0.8,
            route: request.route,
            strategy: request.strategy,
            filters: request.filters,
          },
        ),
        createIndexingRetrievalCandidate(
          {
            id: "doc-2",
            content: `candidate 2 for ${request.effectiveQuery.query}`,
            metadata: {
              sourceId: "docs/runtime",
              fingerprint: "fp-2",
              hierarchyPath: ["runtime", "faq"],
              parentHierarchyPath: ["runtime"],
              hierarchyDepth: 2,
            },
          },
          {
            score: 0.7,
            route: request.route,
            strategy: request.strategy,
            filters: request.filters,
          },
        ),
      ];

      return {
        candidates: filterRetrievalCandidatesByIndexingFilters(
          candidates,
          request.filters,
        ),
        retrievalMetadata: {
          route: request.route ?? "unknown",
        },
      };
    },
  },
  postprocessor: new PassthroughRetrievalPostprocessor(),
  generator: {
    async generate({ request, promptContext }) {
      return {
        answer: `answer for ${request.effectiveQuery.query}: ${promptContext}`,
        generationMetadata: {
          style: "custom",
        },
      };
    },
  },
});

const result = await runtime.run(
  { query: "How does runtime orchestration work?" },
  { includeDebug: true },
);
```

## 调用模型

### `createRuntime(options)`

用途：

- 创建一个可复用的 runtime 实例
- 显式注入四阶段实现

入参要求：

```ts
type CreateRuntimeOptions = {
  preprocessor: QueryPreprocessor;
  retriever: RuntimeRetriever;
  postprocessor: RetrievalPostprocessor;
  generator: RuntimeGenerator;
};
```

适用场景：

- 你需要自定义 query rewrite、route、rerank 或 prompt 组装
- 你不希望默认件隐式参与链路语义

### `createDefaultRuntime(options)`

用途：

- 用默认 preprocessor 与 postprocessor 快速组装最小 runtime

入参要求：

```ts
type CreateDefaultRuntimeOptions = {
  retriever: RuntimeRetriever;
  generator: RuntimeGenerator;
  preprocessor?: QueryPreprocessor;
  postprocessor?: RetrievalPostprocessor;
};
```

默认行为：

- 未传 `preprocessor` 时，使用 `NoopQueryPreprocessor`
- 未传 `postprocessor` 时，使用 `PassthroughRetrievalPostprocessor`
- 默认 postprocessor 当前会优先消费 `request.rerank.minScore` 与 `request.budget`，自动应用 score threshold、predicate filtering、near-duplicate removal、budget trim、source coverage、context ordering 和 selection trace

### `runtime.run(input, options?)`

用途：

- 执行一次完整的在线链路

输入：

```ts
type RuntimeQueryInput = {
  query: string;
  metadata?: Record<string, JsonValue>;
};

type RuntimeRunOptions = {
  includeDebug?: boolean;
  requestId?: string;
};
```

返回：

```ts
type RuntimeResult = Omit<RAGResponse, "debug"> & {
  debug?: RuntimeDebugInfo;
};

type RuntimeCitation = RAGCitation;
```

`RuntimeResult` 主体就是 core 的一次查询审计快照：溯源、决策留痕与回放参数始终写入，不依赖 `includeDebug`。`debug` 仍是 runtime 过程对象（含完整 candidate），不要把它当成落盘账本。

`citations` 是 grounding 引用，不是答案解析结果：

- 顺序与送入 generation 的 `chunks` 一致，`index` 从 1 开始
- 优先用 `selectedCandidates` 补 `score` / `sourceId`；没有 candidate 时从 chunk metadata 回退
- 检索为空时为 `[]`，`run()` 与 `runStream()` 的最终 `result` 同构
- 本切片不解析答案里的 `[1]` / `[2]`，也不要求 generator 另产出引用

`includeDebug` 为 `true` 时，返回的 `debug` 结构为：

```ts
type RuntimeDebugInfo = {
  timings: Partial<Record<RuntimeStage | "total", number>>;
  route?: string;
  rewriteReason?: string;
  retrievalStrategy?: string;
  indexingMode?: "full" | "incremental";
  filters?: RetrievalFilters;
  retrievedCount: number;
  selectedCount: number;
  droppedCount: number;
  finalChunkCount: number;
  appliedBudget?: RetrievalBudget;
  appliedScoreThreshold?: number;
  selectionTrace?: PostRetrievalSelectionTraceEntry[];
  promptContext?: string;
};
```

其中 selection trace 的结构为：

```ts
type PostRetrievalSelectionTraceEntry = {
  candidate: RetrievalCandidate;
  selected: boolean;
  reason:
    | "selected"
    | "predicate-filter"
    | "duplicate"
    | "score-threshold"
    | "source-coverage-quota"
    | "max-candidates"
    | "max-chunks"
    | "max-prompt-chars";
  stage?:
    | "score-threshold"
    | "predicate-filter"
    | "duplicate-removal"
    | "budget-trim"
    | "source-coverage"
    | "context-ordering";
  score?: number;
  order?: number;
};
```

## 四阶段 API 契约

### 1. `QueryPreprocessor`

```ts
interface QueryPreprocessor {
  preprocess(
    input: RuntimeQueryInput,
    context: RuntimeContext,
  ): Promise<RetrievalRequest>;
}
```

职责：

- 把原始输入转成查询期可消费的 `RetrievalRequest`
- 决定 query rewrite、route、topK、filters、strategy 等语义

当前 `RetrievalRequest` 结构：

```ts
type RetrievalRequest = {
  originalQuery: Query;
  effectiveQuery: Query;
  topK?: number;
  filters?: RetrievalFilters;
  strategy?: string;
  route?: string;
  rewriteReason?: string;
  indexingMode?: "full" | "incremental";
  budget?: RetrievalBudget;
  rerank?: RetrievalRerankPolicy;
  metadata?: Record<string, JsonValue>;
};

type RetrievalFilters = {
  sourceIds?: string[];
  fingerprints?: string[];
  hierarchyPaths?: string[];
  parentHierarchyPaths?: string[];
  minHierarchyDepth?: number;
  maxHierarchyDepth?: number;
  metadata?: Record<string, JsonValue>;
};

type RetrievalBudget = {
  maxCandidates?: number;
  maxChunks?: number;
  maxPromptChars?: number;
};

type RetrievalRerankPolicy = {
  strategy?: string;
  topK?: number;
  minScore?: number;
};
```

建议：

- 原始 query 放在 `originalQuery`
- 改写后的 query 放在 `effectiveQuery`
- 不要把 route、filters、strategy 等运行时字段塞回 `core.Query`
- `filters` 优先承载与 `indexing` Phase D 保留契约对齐的 `sourceId`、`fingerprint` 与层级路径筛选
- `budget` 与 `rerank` 用于把预算裁剪和排序阈值从业务临时代码里收拢到标准请求对象

### 2. `RuntimeRetriever`

```ts
interface RuntimeRetriever {
  retrieve(
    request: RetrievalRequest,
    context: RuntimeContext,
  ): Promise<RuntimeRetrievalResult>;
}
```

返回值：

```ts
type RuntimeRetrievalResult = {
  candidates: RetrievalCandidate[];
  retrievalMetadata?: Record<string, JsonValue>;
};

type RetrievalCandidate = {
  chunk: Chunk;
  score?: number;
  route?: string;
  strategy?: string;
  sourceId?: string;
  fingerprint?: string;
  hierarchyPath?: string;
  parentHierarchyPath?: string;
  hierarchyDepth?: number;
  matchedFilters?: string[];
  retrieverMetadata?: Record<string, JsonValue>;
};
```

职责：

- 负责召回候选结果
- 可以附带 score、route 与检索侧调试信息

建议：

- 候选级别信息放在 `RetrievalCandidate`
- 不要把 score 或候选来源回写到 `Chunk.metadata`
- 如果 retrieval 已经消费了 indexing 侧 canonical metadata，优先通过显式字段暴露 `sourceId`、`fingerprint` 与层级路径，而不是要求 postprocessor 反向解析 chunk metadata

### 3. `RetrievalPostprocessor`

```ts
interface RetrievalPostprocessor {
  postprocess(
    input: {
      request: RetrievalRequest;
      candidates: RetrievalCandidate[];
    },
    context: RuntimeContext,
  ): Promise<PostRetrievalResult>;
}
```

返回值：

```ts
type PostRetrievalResult = {
  chunks: Chunk[];
  promptContext?: string;
  selectedCandidates?: RetrievalCandidate[];
  droppedCandidates?: RetrievalCandidate[];
  selectionTrace?: PostRetrievalSelectionTraceEntry[];
  appliedBudget?: RetrievalBudget;
  appliedScoreThreshold?: number;
  postRetrievalMetadata?: Record<string, JsonValue>;
};
```

职责：

- 去重、阈值过滤、rerank、裁剪、上下文拼装
- 生成最终参与回答的 `chunks`
- 可选生成给 generator 使用的 `promptContext`
- 可选保留选中与丢弃的 candidates，供 debug 与后续评测使用

当前约束：

- `promptContext` 在 MVP 中固定为 `string | undefined`
- `selectedCandidates` 与 `droppedCandidates` 是 Phase D 第一批新增的可选调试落点，不要求所有 postprocessor 都立即实现

## 可组合 pipeline 策略框架

四阶段主流程（`run-runtime.ts`）仍按单实例 DI 编排；组合能力通过策略件 + 组合型默认件实现，**不改变** `QueryPreprocessor` / `RetrievalPostprocessor` 接口签名。

### pre-retrieval：`StrategyQueryPreprocessor`

推荐顺序：`query-rewrite` 在前，再接 `query-expansion` / `query-decomposition` / `multi-query` 之一。后三者写入 `subQueries`，需要配合 `FanOutRetriever`。

```ts
import {
  StrategyQueryPreprocessor,
  createQueryRewriteStrategy,
  createMultiQueryStrategy,
} from "@monai-ragsdk/runtime";
import { OpenAIStrategyModel } from "@monai-ragsdk/adapters";

const model = new OpenAIStrategyModel({
  model: "deepseek-v4-flash",
  baseUrl: chatBaseUrl,
});

const preprocessor = new StrategyQueryPreprocessor({
  strategies: [
    createQueryRewriteStrategy({ model }),
    createMultiQueryStrategy({ model, count: 3 }),
  ],
});
```

LLM 调用失败或输出无法解析时，默认 `onError: "passthrough"`，检索仍用原 query。需要失败即中断时设 `onError: "throw"`。

四个策略的差异：

- `createQueryRewriteStrategy`：改写 `effectiveQuery`，不产 `subQueries`
- `createQueryExpansionStrategy`：相关概念扩展，默认把原 query 放进 `subQueries` 首位
- `createQueryDecompositionStrategy`：拆成独立子问题，默认不把原复合问句放进列表
- `createMultiQueryStrategy`：同一意图的多种措辞，默认保留原 query
- `createQueryRoutingStrategy`：用 LLM 写回 `request.route`（以及可选 `request.budget/topK/filters`），供后续检索/后处理选择策略

### retrieval：`FanOutRetriever`

读 `RetrievalRequest.subQueries`，对每个子查询 fan-out 底层 retriever，默认用 `fuseByReciprocalRankFusion()` 融合。无 `subQueries` 时退化为单次检索。

### post-retrieval：`StrategyRetrievalPostprocessor`

```ts
import {
  StrategyRetrievalPostprocessor,
  createScoreThresholdStrategy,
  createLostInTheMiddleStrategy,
} from "@monai-ragsdk/runtime";

const postprocessor = new StrategyRetrievalPostprocessor({
  strategies: [
    createScoreThresholdStrategy({ scoreThreshold: 0.7 }),
    createLostInTheMiddleStrategy(),
  ],
});
```

`PassthroughRetrievalPostprocessor` 内部已委托 `StrategyRetrievalPostprocessor`，历史选项与行为保持等价。

### LLM 策略抽象：`RuntimeStrategyModel`

runtime 只定义 `RuntimeStrategyModel.complete({ prompt, system })`；OpenAI / Ollama 实现在 `@monai-ragsdk/adapters` 的 `OpenAIStrategyModel` / `OllamaStrategyModel`。pre-retrieval 的 rewrite / expansion / decomposition / multi-query 策略件注入该抽象即可。

## 可复用 post-retrieval 策略件

当前 runtime 已提供第一版通用、厂商无关的后处理策略 helper：

### `applyScoreThresholdStrategy(candidates, scoreThreshold)`

用途：

- 依据 `score` 过滤低分候选
- 返回 selected/dropped candidates 与 selection trace

特点：

- 只会过滤 `score` 明确且低于阈值的候选
- 未携带 score 的候选默认保留

### `applyBudgetTrimStrategy(candidates, budget)`

用途：

- 依据 `RetrievalBudget` 裁剪候选结果

当前支持：

- `maxCandidates`
- `maxChunks`
- `maxPromptChars`

特点：

- 会按顺序依次应用 candidate 数、chunk 数和 prompt 长度约束
- 会返回对应的 selection trace reason

### `applyCandidatePredicateStrategy(candidates, predicate, input)`

用途：

- 按自定义 predicate 过滤候选
- 复用现有 `RetrievalCandidate`、`RetrievalRequest` 与 `RuntimeContext`

特点：

- 被过滤的候选会进入 `droppedCandidates`
- selection trace 会记录 `predicate-filter` 阶段与原因

### `applyCandidateOrderingStrategy(candidates, comparator, input)`

用途：

- 在最终 selected candidates 上应用稳定排序
- 为 `context assembly` 的最小排序阶段提供默认 helper

特点：

- 不会新增或删除候选，只调整顺序
- selection trace 会记录最终 `order`

### `createLlmRerankStrategy(options)`

用途：

- 通过 LLM 对候选内容做真实相关性重排序
- 可选写回 `candidate.score`，让后续 score-threshold 策略可继续消费

特点：

- 默认重排不丢弃候选（drop 交给 budget / trim 策略）
- LLM 失败或 JSON 解析失败时，可通过 `onError` 选择透传或抛错

### `createContextCompressionStrategy(options)`

用途：

- 用 LLM 压缩 `candidate.chunk.content`，从而让后续 `promptContext` 与最终答案使用压缩后的上下文

特点：

- 不改变候选数量，只替换每个 chunk 的内容
- 失败时支持透传（`onError: "passthrough"`）或中断（`onError: "throw"`）

### `applyNearDuplicateRemovalStrategy(candidates, config, input)`

用途：

- 在 budget trim 之前移除近重复候选
- 优先复用 `fingerprint` 做精确去重，没有 `fingerprint` 时再退回轻量文本相似度判断

特点：

- 被移除的候选会进入 `droppedCandidates`
- selection trace 会记录 `duplicate-removal` 阶段与 `duplicate` 原因
- 默认会保留分数更高的候选；分数相同时保留更早出现者

### `applySourceCoverageStrategy(candidates, config)`

用途：

- 在预算裁剪之后控制最终候选的 source 覆盖
- 以轻量 `maxPerSource` 配额避免单一 source 独占结果

特点：

- 不依赖第三方 provider 或复杂 MMR
- selection trace 会记录 `source-coverage` 阶段与 `source-coverage-quota` 原因
- Phase 2 默认只实现 `maxPerSource + balanced` 这条轻量路径

### `PassthroughRetrievalPostprocessor`

当前已从“纯透传”升级为“可消费 request 内标准策略字段”的最小默认件：

- 可读取 `request.rerank.minScore`
- 可读取 `request.budget`
- 可接入自定义 `candidatePredicate`
- 可接入 `nearDuplicateRemovalConfig`
- 可接入 `sourceCoverageConfig`
- 可接入自定义 `orderCandidates`
- 可生成 `selectionTrace`
- 仍保持厂商无关，只负责通用后处理逻辑

### 4. `RuntimeGenerator`

```ts
interface RuntimeGenerator {
  generate(
    input: {
      request: RetrievalRequest;
      chunks: Chunk[];
      promptContext?: string;
    },
    context: RuntimeContext,
  ): Promise<RuntimeGenerationResult>;
}
```

返回值：

```ts
type RuntimeGenerationResult = {
  answer: string;
  generationMetadata?: Record<string, JsonValue>;
};
```

职责：

- 基于最终 query、最终 chunks 与 promptContext 生成回答
- 返回 answer 与生成阶段 metadata

## `RuntimeContext` 的使用建议

运行时在每次 `run()` 中都会创建一个请求级上下文：

```ts
type RuntimeContext = {
  requestId: string;
  input: RuntimeQueryInput;
  options: RuntimeRunOptions;
  startedAt: number;
};
```

建议用途：

- 在四阶段之间透传请求级信息
- 记录日志或调试信息时使用统一 `requestId`
- 根据 `options.includeDebug` 决定是否保留额外调试细节

当前不建议：

- 在 `context` 上随意挂载未经约束的可变共享状态

## 默认件说明

### `NoopQueryPreprocessor`

用途：

- 不改写 query
- 直接生成最小 `RetrievalRequest`

可选配置：

```ts
type NoopQueryPreprocessorOptions = {
  topK?: number;
  strategy?: string;
  route?: string;
  indexingMode?: "full" | "incremental";
  filters?: RetrievalFilters;
  budget?: RetrievalBudget;
  rerank?: RetrievalRerankPolicy;
};
```

行为要点：

- `originalQuery` 与 `effectiveQuery` 相同
- 会透传 `input.metadata`
- 可直接为最小链路补上 `filters`、`budget`、`rerank` 与 `indexingMode`

### `PassthroughRetrievalPostprocessor`

用途：

- 以厂商无关的方式组合默认 post-retrieval 策略
- 在不自定义完整 `RetrievalPostprocessor` 的前提下增强默认后处理逻辑

可选配置：

```ts
type PassthroughRetrievalPostprocessorOptions = {
  scoreThreshold?: number;
  budget?: RetrievalBudget;
  applyRequestScoreThreshold?: boolean;
  applyRequestBudget?: boolean;
  includeSelectionTrace?: boolean;
  candidatePredicate?: CandidatePredicate;
  nearDuplicateRemovalConfig?: {
    enabled?: boolean;
    similarityThreshold?: number;
    fingerprintBased?: boolean;
    comparator?: CandidateComparator;
  };
  sourceCoverageConfig?: {
    enabled?: boolean;
    maxPerSource?: number;
    distribution?: "balanced";
    getSourceKey?: (candidate: RetrievalCandidate) => string | undefined;
  };
  orderCandidates?: CandidateComparator;
  buildPromptContext?: (
    request: RetrievalRequest,
    candidates: RetrievalCandidate[],
  ) => string | undefined;
};
```

默认 `promptContext` 规则：

- 没有候选结果时返回 `undefined`
- 有候选结果时，格式为 `query: ...` 加上候选 chunk 内容拼接
- 默认会按 `score threshold -> predicate filtering -> near-duplicate removal -> budget trim -> source coverage -> context ordering` 的顺序处理 candidates

如果你只需要基于轻量选项创建默认 postprocessor，也可以使用：

```ts
type CreateDefaultPostprocessorOptions =
  PassthroughRetrievalPostprocessorOptions & {
    debug?: boolean;
  };
```

其中 `debug` 会映射为 `includeSelectionTrace`，便于在 demo 或接入代码中快速打开默认 trace。

Phase 2 当前默认约定：

- `nearDuplicateRemovalConfig` 优先按 `fingerprint` 精确去重，没有 `fingerprint` 时退回轻量文本近重复判断
- `sourceCoverageConfig` 当前只承诺 `maxPerSource + balanced` 这条轻量路径

## 错误语义

任一阶段抛出的异常都会被统一包装为 `RuntimeError`。

```ts
class RuntimeError extends RAGCoreError {
  readonly stage: RuntimeStage;
  readonly originalQuery: Query;
  readonly effectiveQuery?: Query;
}
```

当前阶段值包括：

- `pre-retrieval`
- `retrieval`
- `post-retrieval`
- `generation`

使用建议：

- 业务层统一捕获 `RuntimeError`
- 进一步通过 `stage` 判断失败发生在哪个阶段
- 需要查看原始异常时，读取 `cause`

## 与 indexing Phase D 契约的当前映射

当前建议的映射方式如下：

- `sourceId` -> `RetrievalRequest.filters.sourceIds` 与 `RetrievalCandidate.sourceId`
- `fingerprint` -> `RetrievalRequest.filters.fingerprints` 与 `RetrievalCandidate.fingerprint`
- `hierarchyPath` / `parentHierarchyPath` / `hierarchyDepth` -> `RetrievalRequest.filters.*` 与 `RetrievalCandidate.*`
- `IndexingMode` -> `RetrievalRequest.indexingMode`

当前 runtime 已提供对应 helper：

- `createIndexingRetrievalFilters()`：规范化 `sourceId`、`fingerprint`、层级路径等过滤输入
- `createIndexingRetrievalRequest()`：构建与 indexing canonical metadata 对齐的请求对象
- `createIndexingRetrievalCandidate()`：把 indexing 写入到 chunk metadata 的字段抬升为显式 candidate 字段
- `filterRetrievalCandidatesByIndexingFilters()`：按标准 filters 执行候选筛选并记录 `matchedFilters`

这套映射的目标是让 runtime 能稳定消费 indexing 已保留的 canonical metadata，而不是让业务层在 query 时自行拼接临时字段。

## 当前接入建议

进入 Phase D 之前，建议把 `runtime` 作为一个“稳定的四阶段编排壳”来使用：

- `runtime` 自身负责流程、上下文、结果结构与错误边界
- 第三方 retriever / generator 适配继续放在 `adapters` 或业务实现层；当前 `@monai-ragsdk/adapters` 已提供 LangChain 查询期适配
- 如果只是联通在线链路，优先使用 `createDefaultRuntime()`
- 如果要做 Phase D 相关扩展，优先从 `preprocessor` 与 `postprocessor` 两个阶段下手

## 当前验证命令

- `pnpm --filter @monai-ragsdk/runtime build`
- `pnpm --filter @monai-ragsdk/runtime test`
- `pnpm --filter @monai-ragsdk/runtime demo`
- `pnpm --filter @monai-ragsdk/runtime demo:custom`
