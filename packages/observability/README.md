# observability

## 定位

`observability` 用于承载 RAG 链路的 tracing、metrics 与 observer 基础协议。

## 当前目录

- `src/`：源码目录，仅允许放置 `.ts` 源码。
- `src/index.ts`：源码入口文件。
- `src/types/`：trace / event / metric / error 的公开协议。
- `src/observer/`：`RAGObserver`、`NoopObserver` 与最小 console observer。
- `src/exporters/`：`TraceExporter` 抽象和基础 exporter。
- `src/formatters/`：console 输出格式化辅助。
- `src/errors/`：包内最小错误类型。
- `dist/`：构建产物输出目录，仅在执行构建后生成。

## 当前状态

当前已完成 Phase 1 的第一批最小实现：

- 公开协议类型：`TraceContext`、`RAGTrace`、`RAGEvent`、`RAGMetric`、`RAGErrorRecord`
- `RAGAttributes` 复用 `@monai-ragsdk/core` 的 `JsonValue`
- 最小 observer 能力：`RAGObserver`、`NoopObserver`、`createConsoleObserver()`

当前已完成 Phase 4 的第一批实现：

- `TraceExporter` 抽象
- `createRAGObserver()` 组合 observer
- `createConsoleExporter()`
- `createMemoryTraceExporter()`
- `createJsonlTraceExporter()`

当前仍未覆盖：

- `HTTP` exporter
- redaction 与 sampling
- 集成或冒烟验证

当前跨包接线现状：

- `runtime` 与 `indexing` 已可通过可选 `observer` 发出 event / error / trace
- `createRAGObserver()` 已可接收这些事件，并在 `onTraceEnd` 时统一扇出到 exporter
- `packages/indexing/demo/run-indexing.ts` 已演示通过 `createJsonlTraceExporter()` 将 trace 落到 JSONL 文件

## 构建约定

- 对外入口固定指向 `dist/index.js` 与 `dist/index.d.ts`。
- 构建产物必须输出到 `dist/`。
- 不允许把 `.js`、`.d.ts` 等构建产物回写到 `src/`。

## 当前可用能力

最小可用导出如下：

- `RAGObserver`
- `NoopObserver`
- `createConsoleObserver()`
- `createRAGObserver()`
- `TraceExporter`
- `createConsoleExporter()`
- `createMemoryTraceExporter()`
- `createJsonlTraceExporter()`
- `TraceContext`
- `RAGTrace`
- `RAGEvent`
- `RAGMetric`
- `RAGErrorRecord`

时间字段（`RAGEvent.timestamp`、`RAGErrorRecord.timestamp`、`RAGTrace.startedAt` / `endedAt`）统一为 Unix 毫秒时间戳；JSONL 落盘与 observer 流通保持 number，控制台展示时再转 ISO。

这些导出当前只覆盖包内协议和本地最小观测，不代表已经进入完整生产能力阶段。

## 接入说明

- 面向使用者的最小接入文档见 `docs/observability/observability-integration-guide.md`
- 其中包含 `createRAGObserver()`、`createJsonlTraceExporter()` 以及 `runtime` / `indexing` 的最小接线示例
