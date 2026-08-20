# `@monai-ragsdk/observability` — 现状

> 快照：**2026-08-19** · 状态：**稳定**
> 源码：`packages/observability/` · 用法：[README](../../packages/observability/README.md)
> 回：[routing.md](./routing.md)

## 1. 定位

可观测协议与失败隔离。indexing / runtime 通过 `RAGObserver` 上报事件、错误和整条 trace；本包负责缓冲与导出，**不介入业务编排**。

依赖：仅 `@monai-ragsdk/core`（主要是 `JsonValue`）。

`adapters` **不**直接依赖本包。厂商适配只做事；trace 由 indexing / runtime 在流水线里通知 observer。

## 2. 边界

- 不对接 OTLP（明确排除，不是欠债）。
- 不实现检索、生成或存储。
- 不生成 `traceId` / `requestId`：由 indexing / runtime 在发起流水线时写入。
- 不要把 chunk 正文、`promptContext`、压缩前 `originalContent` 塞进 observer。

## 3. 当前能力

| 分组 | 现状 |
| --- | --- |
| 协议 | `RAGObserver`：`onEvent` / `onError` / `onTraceEnd` / `flush` / `shutdown` |
| 工厂 | `createRAGObserver({ exporters })` |
| Observer | `NoopObserver`、`createConsoleObserver()` |
| Exporter | `createConsoleExporter()`、`MemoryTraceExporter`、`createJsonlTraceExporter()` |

exporter 失败会被隔离，默认不拖死主链路。

事件名按 scope：`runtime.<stage>.<action>` 或 `indexing.<stage>.<action>`。action 包括 `receive` / `preprocess` / `start` / `complete` / `fail` / `select` / `drop` / `store`。

`traceIdSource`：`provided` | `requestId` | `generated`。

runtime 侧还有策略步进事件（`query_strategy.*`、`retrieval_fanout.*`、`retrieval_fuse.*`、`post_retrieval_strategy.*`），字段由 runtime 的 `observation/` 组装，协议形状在本包 README。

分数口径类型：观测层 `ObservationScoreKind` 已是 runtime `RetrievalScoreKind` 的别名，不再两套枚举。

## 4. 关键入口

| 路径 | 职责 |
| --- | --- |
| `src/observer/` | 协议、工厂、noop / console |
| `src/exporters/` | console / memory / jsonl |
| `src/types/` | Event / Trace / Error / Attributes |
| `src/utils/invoke-observer-safely.ts` | 观测失败隔离 |

被谁用：`indexing`、`runtime`、`apps/cli`、`apps/example`（及 server 观测 API）。

## 5. 测试与脚本

- 单测约 14（phase-one / phase-four）
- `pnpm --filter @monai-ragsdk/observability test`
- 本包无 demo；完整链路看 `apps/example` 的 observability 示例，或 indexing / runtime demo。

## 6. 已知缺口

- 无 OTLP：按边界，不要当功能缺口开。
- runtime 默认 passthrough 链里空转的 score-threshold 等不再出现在审计 `appliedStrategies`，但 observer 仍有 `complete` + `outcome: passthrough`。只看审计会低估「配了哪些策略」——以 observer 为准。

## 7. 关联

- 字段约定以本包 README 为权威；runtime 如何打点见 [runtime.md](./runtime.md)
- RRF 融合分观测为 `rrf`，不再标成 `retriever`；优先读 candidate 上的 `scoreKind`
