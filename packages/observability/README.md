# `@monai-ragsdk/observability`

## 定位

可观测协议与失败隔离。indexing / runtime 通过 `RAGObserver` 上报事件、错误和整条 trace；本包负责缓冲、导出，不介入业务编排。

## 依赖

- workspace：`@monai-ragsdk/core`（主要是 `JsonValue`）
- 被谁用：`indexing`、`runtime`、`apps/example`

`adapters` 不直接依赖本包。厂商适配只做事；trace 由 indexing / runtime 在流水线里通知 observer。

## 公开能力

| 分组     | 内容                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| 协议     | `RAGObserver`：`onEvent` / `onError` / `onTraceEnd` / `flush` / `shutdown`     |
| 工厂     | `createRAGObserver({ exporters })`                                             |
| Observer | `NoopObserver`、`createConsoleObserver()`                                      |
| Exporter | `createConsoleExporter()`、`MemoryTraceExporter`、`createJsonlTraceExporter()` |

事件名按 scope 区分：`runtime.<stage>.<action>` 或 `indexing.<stage>.<action>`。action 包括 `receive` / `preprocess` / `start` / `complete` / `fail` / `select` / `drop` / `store`。

exporter 失败会被隔离，默认不拖死主链路。

## 关联键

`traceId` / `requestId` 在 `RAGEvent` 与 `RAGTrace` 上，**不写进 attributes**。本包不生成 ID，由 indexing / runtime 在发起流水线时写入。

`RAGTrace.traceIdSource`：

| 值          | 含义                                         |
| ----------- | -------------------------------------------- |
| `provided`  | 调用方传入了 `trace.traceId`                 |
| `requestId` | 未传 `traceId`，复用调用方传入的 `requestId` |
| `generated` | 内核兜底生成                                 |

runtime 缺省用 UUID，不把 query 嵌进 ID；只传 `requestId` 时 `traceId` 与之相同。生产网关应传入自己的 `requestId` / `trace.traceId`。indexing 缺省为 `indexing:${mode}:${startedAt}`。

## runtime 事件 attributes

分层靠事件名，不另造展示分类。按 `event.name` / `stage` 分组即可，不要为 UI 再加 `role` / `title`。

- **阶段检查点**（无编排器也有）：`runtime.query.*`、`retrieval.*`、`post_retrieval.select`、`generation.*`、`run.*` / `search.*`。记录该阶段结束时的产物，可独立阅读。
- **策略步进**（编排器才有）：`runtime.query_strategy.*`、`retrieval_fanout.*`、`retrieval_fuse.*`、`post_retrieval_strategy.*`。记录该步相对上一步的变化。

检查点回答「这一阶段产出了什么」，成功路径用 `output`，一般没有成对的 `input`。`runtime.query.receive` 是入口检查点，用户 query 进入 pipeline 后就是初始工作态，因此是 `output.query`，不是 `input`。策略步进才用成对的 `input` / `output` 表示相对上一步改了什么。

有意义才写入的键：

| 键                 | 何时出现                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `strategy`         | 仅策略步进：`{ name, index }`                                                            |
| `outcome`          | 可能透传或失败的步骤：`applied` / `passthrough` / `failed`。阶段检查点成功不写 `applied` |
| `input` / `output` | 有变换或阶段产物时。形状按域走，不强行统一成一种卡片                                     |
| `counts`           | 聚合数字：`candidates` / `selected` / `dropped` / `compressed` / `chunks`                |
| `candidates`       | `{ chunkId, score?, scoreKind? }`，`scoreKind` 为 `retriever` \| `rrf` \| `llm`          |
| `decisions`        | 该步自己的选留；`stage` 用真实策略名。`post_retrieval.select` 不带此字段                 |
| `error`            | 失败时 `{ name, message, code? }`，不再平铺 `errorName` / `errorMessage`                 |

query 意图快照形如 `{ query, subQueries?, route?, routeDecision?, filters? }`。不要把 `request.strategy`（routing 可能写入的 route 名）当成策略名打出去。

### 策略步进记什么

| 事件                                                   | attributes                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `query_strategy.complete`                              | `strategy` + `outcome` + `input` / `output`（query 意图）。透传仍写 input/output，才能看出没改什么 |
| `query_strategy.fail` / `post_retrieval_strategy.fail` | `strategy` + `outcome: failed` + `error`                                                           |
| `retrieval_fanout.complete`                            | `input: { index, query }` + `candidates`（`scoreKind: retriever`）+ `counts`                       |
| `retrieval_fanout.fail`                                | `input: { index, query }` + `outcome: failed` + `error`                                            |
| `retrieval_fuse.complete`                              | `candidates`（`scoreKind: rrf`）+ `counts: { subQueries, fused }`                                  |
| `post_retrieval_strategy.complete`                     | `strategy` + `outcome` + `counts` + `decisions`。ids 在 decisions 里，不再并列 `selectedChunkIds`  |

### 阶段检查点记什么

| 事件                               | attributes                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `query.receive`                    | `output: { query }`                                                                                |
| `query.preprocess`                 | `output: { query, subQueries?, route?, filters?, appliedStrategies? }`                             |
| `retrieval.start`                  | `output: { query }`                                                                                |
| `retrieval.complete`               | `counts` + `candidates`（fan-out 则为 `scoreKind: rrf`，否则 `retriever`）+ 可选 `output.provider` |
| `post_retrieval.start`             | `counts: { candidates }`                                                                           |
| `post_retrieval.select`            | `counts` + `output: { chunkIds, appliedStrategies? }`。不带 `decisions`                            |
| `generation.start`                 | `counts: { chunks }`                                                                               |
| `generation.complete`              | `counts` + `output: { model?, streamed?, citations, answerPreview }`                               |
| `run.complete` / `search.complete` | `counts: { chunks }`；耗时用事件上的 `durationMs`                                                  |
| `run.fail` / `search.fail`         | `outcome: failed` + `output: { stage }` + `error`                                                  |

`*.start` 不是空 marker，可带该阶段入口必要字段。自定义 preprocessor / retriever 没有策略事件时，检查点仍足够还原阶段结果。

不要把 chunk 正文、`promptContext`、压缩前 `originalContent` 塞进 observer。

## 使用方式

```ts
import { createJsonlTraceExporter, createRAGObserver } from '@monai-ragsdk/observability';

const observer = createRAGObserver({
  serviceName: 'monai-ragsdk',
  exporters: [
    createJsonlTraceExporter({
      filePath: './.artifacts/trace.jsonl',
    }),
  ],
});

// 交给 runIndexing / createDefaultRuntime / createCollection
await observer.flush?.();
await observer.shutdown?.();
```

只想看控制台时用 `createConsoleObserver({ level: 'debug' })`。测试或不需要观测时用 `NoopObserver`。

## 脚本

```bash
pnpm --filter @monai-ragsdk/observability test
```

本包没有 demo；完整链路可看 `apps/example` 的 `observability` 示例，或 indexing / runtime 的 demo。

## 边界

- 不对接 OTLP。
- 不实现检索、生成或存储。
- 不要把业务字段塞进 observer；只传协议约定的 event / error / trace。
