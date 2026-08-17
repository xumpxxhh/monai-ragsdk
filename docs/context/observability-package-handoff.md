# observability 包交接文档

## 目的

本文档用于帮助后续接手 `packages/observability` 的 AI 或开发者快速理解当前实现边界、公开协议、observer / exporter 设计约束与跨包接线现状。

## 当前定位

`observability` 当前定位为：

**面向 MonAI RAG SDK 的轻量 tracing 与 observer / exporter 协议层。**

它负责：

- 定义 trace、event、metric、error 的 JSON-safe 协议
- 提供 `RAGObserver` 与最小 observer 实现
- 提供 `TraceExporter` 抽象与基础 exporter
- 负责把 `runtime` / `indexing` 发出的观测数据安全汇总并导出

它当前不负责：

- 正式的 metrics backend 对接
- 完整 redaction / sampling 策略
- 复杂 span 树模型
- HTTP、OTLP 等更完整 exporter 生态

## 当前已实现范围

当前 `observability` 已完成：

- 协议类型：`TraceContext`、`RAGTrace`、`RAGEvent`、`RAGMetric`、`RAGErrorRecord`
- JSON-safe attributes：`RAGAttributes`、`RAGTags`
- observer 协议：`RAGObserver`
- observer 实现：`NoopObserver`、`createConsoleObserver()`、`createRAGObserver()`
- exporter 协议：`TraceExporter`
- exporter 实现：`createConsoleExporter()`、`createMemoryTraceExporter()`、`createJsonlTraceExporter()`
- console 格式化与 observer 失败隔离辅助工具
- 包级 unit test

当前仍未覆盖：

- `HTTP` exporter
- 更正式的 trace persistence / rotation 策略
- redaction / sampling
- 根级 integration / smoke 对 observability 的显式覆盖

## 目录结构

```text
packages/observability/
  src/
    errors/
    exporters/
    formatters/
    observer/
    types/
    utils/
    index.ts
  __tests__/
  README.md
  package.json
  tsconfig.json
```

目录职责：

- `src/types/`：trace / event / metric / error 的公开协议
- `src/observer/`：observer 接口、noop / console / composite observer
- `src/exporters/`：exporter 抽象与 console / memory / JSONL 实现
- `src/formatters/`：console 输出格式化辅助
- `src/utils/`：observer / exporter 调用时的安全封装
- `__tests__/`：协议与 observer / exporter 组合测试

## 当前公开导出

包入口 `src/index.ts` 当前统一导出：

- `types/*`
- `observer/*`
- `exporters/*`
- `errors/*`

最常用的公开 API：

- `RAGObserver`
- `NoopObserver`
- `createConsoleObserver()`
- `createRAGObserver()`
- `TraceExporter`
- `createConsoleExporter()`
- `createMemoryTraceExporter()`
- `createJsonlTraceExporter()`
- `RAGTrace`
- `RAGEvent`
- `RAGMetric`
- `RAGErrorRecord`

## 关键设计约束

### 1. attributes 必须保持 JSON-safe

当前 `RAGAttributes` 与 tags 复用 `@monai-ragsdk/core` 的 JSON-safe 约束。

不要把 `Date`、`Map`、函数或 class instance 直接放进 trace、event、error 的 attributes。

### 2. observer / exporter 失败不能反向破坏主流程

当前 `runtime` 与 `indexing` 都假定 observer 是可选且失败隔离的。

因此后续扩展 `createRAGObserver()`、console observer 或任何 exporter 时，都必须保持：

- 单个 observer / exporter 报错不能中断主流程
- trace 导出失败不能让 `runtime.run()` 或 `runIndexing()` 失败
- 生命周期方法的失败要在边界内被显式处理

### 3. `createRAGObserver()` 负责在 `onTraceEnd` 聚合导出

当前组合 observer 会先缓存 `onEvent` / `onError` 收到的数据，再在 `onTraceEnd` 收到终态 trace 时进行归并并扇出给 exporter。

后续如果扩展行为，应优先保持这个模型稳定，而不是让 exporter 直接感知半成品事件流。

### 4. exporter 应优先保持轻量与依赖克制

当前 console / memory / JSONL exporter 都不引入额外依赖。

如果后续要补 HTTP 或更复杂 exporter，应先确认依赖安装策略与包边界，不要把第三方 SDK 直接混入当前最小实现里。

## 当前跨包接线现状

- `packages/runtime` 已支持可选 `observer` 和 `trace` 配置，会发出 runtime 侧 event / error / trace
- `packages/indexing` 已支持可选 `observer` 和 `trace` 配置，会发出 indexing 侧 event / error / trace
- `packages/indexing/demo/run-indexing.ts` 已演示通过 `createRAGObserver()` + `createJsonlTraceExporter()` 把最终 trace 落到 `demo/.artifacts/run-indexing-trace.jsonl`
- 当前还没有 `observability` 包自己的独立 demo；最直接的端到端演示入口是 indexing demo

## 当前验证现状

当前已经具备并通过：

1. `pnpm --filter @monai-ragsdk/observability build`
2. `pnpm --filter @monai-ragsdk/observability test`
3. `pnpm --filter @monai-ragsdk/indexing demo:run-indexing`

当前测试重点：

- JSON-safe attributes 与事件命名
- `NoopObserver` 与 console observer 的最小行为
- `createRAGObserver()` 的多 exporter 扇出、失败隔离、buffered error 合并与生命周期转发
- JSONL exporter 的写入、截断与 observer 联动落盘

## 后续推进建议

1. 如果继续扩 exporter，优先补 `HTTP` exporter，而不是过早引入更复杂 observability backend。
2. 如果要补更正式的 trace 协议，优先先明确 span / sampling / redaction 的边界，再扩公开类型。
3. 如果后续新增 runtime 或 indexing demo，应优先复用 `createRAGObserver()`，而不是在业务包里直接堆 exporter 细节。
4. 如果文档与代码状态不一致，优先同步更新 `packages/observability/README.md`、本交接文档和相关 demo 说明。
