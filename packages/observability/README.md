# `@monai-ragsdk/observability`

## 定位

可观测协议与失败隔离。indexing / runtime 通过 `RAGObserver` 上报事件、错误和整条 trace；本包负责缓冲、导出，不介入业务编排。

## 依赖

- workspace：`@monai-ragsdk/core`（主要是 `JsonValue`）
- 被谁用：`indexing`、`runtime`、`apps/cli`、`apps/example`

`adapters` 不直接依赖本包。厂商适配只做事；trace 由 indexing / runtime 在流水线里通知 observer。

## 公开能力

| 分组 | 内容 |
| --- | --- |
| 协议 | `RAGObserver`：`onEvent` / `onError` / `onTraceEnd` / `flush` / `shutdown` |
| 工厂 | `createRAGObserver({ exporters })` |
| Observer | `NoopObserver`、`createConsoleObserver()` |
| Exporter | `createConsoleExporter()`、`MemoryTraceExporter`、`createJsonlTraceExporter()` |

事件名按 scope 区分：`runtime.<stage>.<action>` 或 `indexing.<stage>.<action>`。action 包括 `receive` / `preprocess` / `start` / `complete` / `fail` / `select` / `drop` / `store`。

exporter 失败会被隔离，默认不拖死主链路。

## 使用方式

```ts
import {
  createJsonlTraceExporter,
  createRAGObserver,
} from '@monai-ragsdk/observability';

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
