# `@monai-ragsdk/runtime`

## 定位

在线 RAG 内核。把 pre-retrieval → retrieval → post-retrieval → generation 串成可组合 pipeline，并挂知识库门面 MVP `createCollection()`。

策略件本体在本包；厂商 LLM 实现在 `adapters`。

## 依赖

- workspace：`core`、`observability`、`indexing`
- 被谁用：`adapters`（实现 `RuntimeRetriever` / `RuntimeGenerator` / `RuntimeStrategyModel`）、`apps/cli`、`apps/example`

依赖 `indexing` 的原因：`createCollection().ingest()` 调用 `runIndexing`；另外提供 indexing 查询协议（按 sourceId / fingerprint / hierarchy 过滤候选）。不是误引。

实现 `RuntimeRetriever` 时请从 `@monai-ragsdk/runtime/contract` 引用 `createIndexingRetrievalCandidate`、`filterRetrievalCandidatesByIndexingFilters`、`fuseByReciprocalRankFusion` 等契约工具；这些符号已从包根撤出，避免内部 `apply*` / 解析函数被锁成公开 API。

## 运行入口

`createRuntime()` / `createDefaultRuntime()` 得到 `Runtime`：

| 方法 | 行为 |
| --- | --- |
| `run()` | 完整问答，走 `generator.generate()` |
| `search()` | 只跑前三阶段，不调用 generator，没有 answer |
| `runStream()` | 检索一次性完成，只对流式 generation；无 `generateStream` 时回退为单段完整答案 |

`createDefaultRuntime()` 缺省 preprocessor 为 `NoopQueryPreprocessor`，postprocessor 为 `PassthroughRetrievalPostprocessor`。

按配置编译（策略数组 + FanOut + 官方 post 顺序）用 `createRuntimeFromConfig()`：显式传入的 `postRetrieval.rerank` 会插在 `score-threshold` 之前，默认链不含 llm-rerank。

## 策略框架

Pre-retrieval（`QueryStrategy`，经 `StrategyQueryPreprocessor` 串联）：

- `createQueryRewriteStrategy`：改写 `effectiveQuery`，不改 `originalQuery`
- `createQueryExpansionStrategy`：扩展相关查询到 `subQueries`
- `createQueryDecompositionStrategy`：拆成可独立检索的子问题
- `createMultiQueryStrategy`：同一意图多种措辞
- `createQueryRoutingStrategy`：产出 route / topK / budget / filters

多路召回用 `FanOutRetriever` 读 `subQueries`，默认 `fuseByReciprocalRankFusion`（RRF，k=60）。无 `subQueries` 时退化为单次检索。

Post-retrieval（可交给 `createDefaultPostprocessor`，或用 `StrategyRetrievalPostprocessor` 自定义链）：

- 分数阈值、predicate 过滤、近重复去除、budget trim、source coverage
- `createLlmRerankStrategy`：真实 LLM 重排序
- `createContextCompressionStrategy`：上下文压缩
- `applyLostInTheMiddleStrategy`：高分居首尾，只重排不丢弃

LLM 策略默认失败透传，避免检索被策略拖死；需要硬失败时设 `onError: 'throw'`。`RuntimeStrategyModel` 与 `RuntimeGenerator` 解耦，厂商实现放 adapters。

结果带 grounding citations：按 post-retrieval 选出的 chunks 顺序编号；`run` / `runStream` / `search` 共用同一套规则。

## 可观测打点

把 `observer` 交给 `createRuntime` / `createDefaultRuntime` / `createRuntimeFromConfig` 后，主流程打阶段检查点；下列编排器额外打策略步进，写入同一条 trace。字段约定见 [`@monai-ragsdk/observability` README](../observability/README.md)。

- `StrategyQueryPreprocessor`：`runtime.query_strategy.complete`（未改检索意图时 `outcome: passthrough`）
- `FanOutRetriever`：真正多路时 `runtime.retrieval_fanout.*` 与 `runtime.retrieval_fuse.complete`
- `StrategyRetrievalPostprocessor`（含默认 `PassthroughRetrievalPostprocessor`）：`runtime.post_retrieval_strategy.complete`

自定义实现可走 `context.observe?.emit(...)`；`adapters` 忽略即可。观测失败不会打断检索。

`RetrievalRequest.appliedStrategies` 与 `PostRetrievalResult.appliedStrategies` 只记真正改变了意图/候选的策略名；透传只出现在 observer 的 `outcome: passthrough`。结果快照 `strategies` 优先用这两份有序列表。

### 关联键

`run()` / `runStream()` / `search()` 共用同一套解析。ID 是不透明关联键，query 只出现在事件 attributes。

| 调用方传入 | `requestId` | `traceId` | `traceIdSource` |
| --- | --- | --- | --- |
| 都不传 | 内核 UUID | 另一个 UUID | `generated` |
| 只传 `requestId` | 用传入值 | 复用该值 | `requestId` |
| 传了 `trace.traceId` | 缺省则新 UUID | 用传入值 | `provided` |

生产环境应由网关传入 `requestId` 与 `trace.traceId`；内核兜底是为了 demo / 单测 / `createCollection().ask()` 在没有请求上下文时仍能成条 trace。

```ts
await runtime.run(
  { query: 'pgvector 是什么？' },
  {
    requestId: 'req-from-gateway',
    trace: { traceId: 'trace-from-parent', tags: { app: 'kb' } },
  },
);
```

## 知识库门面 MVP

`createCollection({ indexing, runtime })` 只做编排，不另开存储 / 查询路径：

- `ingest(documents)`：临时 in-memory Loader → `runIndexing`
- `search(query)`：retrieve-only
- `ask(query)`：完整 `runtime.run()`
- `listSources()` / `deleteByFilters()` / `close()`：store 未实现对应方法时返回空 / `false`，不当错误抛出

不要新开 kb 包，也不要在这里扩展完整文档生命周期。

## 使用方式

```ts
import {
  createQueryRewriteStrategy,
  createRuntimeFromConfig,
  type RuntimeRetriever,
} from '@monai-ragsdk/runtime';
import { OpenAIRuntimeGenerator, OpenAIStrategyModel } from '@monai-ragsdk/adapters';

const model = new OpenAIStrategyModel({
  model: 'deepseek-chat',
  baseUrl: process.env.OPENAI_BASE_URL!,
});

// retriever 由 adapters 提供，默认用 PgVectorRuntimeRetrieverAdapter
declare const retriever: RuntimeRetriever;

const runtime = createRuntimeFromConfig({
  retriever,
  query: {
    strategies: [createQueryRewriteStrategy({ model })],
  },
  postRetrieval: {
    scoreThreshold: 0.2,
    budget: { maxCandidates: 5 },
  },
  generator: new OpenAIRuntimeGenerator({
    model: 'deepseek-chat',
    baseUrl: process.env.OPENAI_BASE_URL!,
  }),
});

const result = await runtime.run(
  { query: '什么是 runtime？' },
  // 可选；不传时 requestId / traceId 由内核生成 UUID
  { requestId: 'req-1', trace: { traceId: 'trace-1' } },
);
```

## 脚本

```bash
pnpm --filter @monai-ragsdk/runtime test
pnpm --filter @monai-ragsdk/runtime demo
pnpm --filter @monai-ragsdk/runtime demo:custom
```

Collection 演示：`packages/runtime/demo/collection-demo.ts`。策略链演示：`packages/runtime/demo/strategy-pipeline.ts`。

## 边界

- Active RAG / 自纠错循环仍冻结。
- 不做答案内标记解析。
- 不补 Chroma 查询，不新增第二查询路径。
- 不要为 CLI 体验回头改本包边界。
