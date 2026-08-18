# observability 接入说明

## 目的

本文档面向使用者，说明如何在当前仓库里用最小方式接入 `@monai-ragsdk/observability`，并把 `runtime` 或 `indexing` 发出的 trace 落到 JSONL 文件中。

本文档只覆盖当前已经实现并验证过的最小能力：

- `createRAGObserver()`
- `createJsonlTraceExporter()`
- `runtime` 的最小接线方式
- `indexing` 的最小接线方式

## 当前可用能力

当前 `@monai-ragsdk/observability` 已提供：

- `createRAGObserver()`：组合 observer，负责缓存 event / error，并在 `onTraceEnd` 时统一导出
- `createJsonlTraceExporter()`：把最终 trace 以 JSONL 形式写入本地文件
- `createConsoleExporter()`：把最终 trace 输出到终端
- `createMemoryTraceExporter()`：把 trace 存到内存里，方便测试或调试

当前 `runtime` 与 `indexing` 都已经支持：

- `observer`：注入 `RAGObserver`
- `trace`：传入 trace 级配置

## 最小接入步骤

最小接入通常只需要三步：

1. 创建 exporter，例如 `createJsonlTraceExporter()`。
2. 用 `createRAGObserver()` 组合出一个 observer。
3. 把 observer 传给 `runtime` 或 `indexing`，并在运行结束后调用 `observer.shutdown?.()`。

## 1. 创建最小 observer

```ts
import { fileURLToPath } from "node:url";

import {
  createJsonlTraceExporter,
  createRAGObserver,
} from "@monai-ragsdk/observability";

const traceFilePath = fileURLToPath(
  new URL("./.artifacts/rag-trace.jsonl", import.meta.url),
);

const observer = createRAGObserver({
  serviceName: "rag-demo",
  environment: "local-demo",
  exporters: [
    createJsonlTraceExporter({
      filePath: traceFilePath,
      append: false,
    }),
  ],
});
```

说明：

- `serviceName` 与 `environment` 会在最终 trace 上补齐。
- `append: false` 表示每次运行都先清空旧文件，适合 demo。
- 如果希望连续记录多次运行结果，可以改成 `append: true`。

## 2. 在 runtime 中接入

`runtime` 的接线分成两部分：

- 在创建 runtime 时传入 `observer`
- 在 `runtime.run()` 时传入 `trace`

最小示例：

```ts
import { fileURLToPath } from "node:url";

import {
  createJsonlTraceExporter,
  createRAGObserver,
} from "@monai-ragsdk/observability";
import { createDefaultRuntime } from "@monai-ragsdk/runtime";

const traceFilePath = fileURLToPath(
  new URL("./.artifacts/runtime-trace.jsonl", import.meta.url),
);

const observer = createRAGObserver({
  serviceName: "runtime-demo",
  environment: "local-demo",
  exporters: [
    createJsonlTraceExporter({
      filePath: traceFilePath,
      append: false,
    }),
  ],
});

const runtime = createDefaultRuntime({
  observer,
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
            sourceId: "docs/runtime",
          },
        ],
      };
    },
  },
  generator: {
    async generate({ request, chunks }) {
      return {
        answer: `${request.effectiveQuery.query} -> ${chunks.map((chunk) => chunk.id).join(",")}`,
      };
    },
  },
});

const result = await runtime.run(
  { query: "Explain runtime observability" },
  {
    trace: {
      traceId: "runtime-demo-trace",
      tags: {
        scenario: "runtime-jsonl-demo",
      },
    },
  },
);

await observer.shutdown?.();
```

说明：

- `observer` 放在 `createDefaultRuntime()` 或 `createRuntime()` 的 options 里。
- `trace.traceId` 和 `trace.tags` 放在 `runtime.run()` 的第二个参数里。
- `runtime` 会自动发出 `runtime.query.receive`、`runtime.retrieval.start`、`runtime.generation.complete`、`runtime.run.complete` 等事件，并在结束时导出最终 trace。

## 3. 在 indexing 中接入

`indexing` 的接线更直接：`observer` 和 `trace` 都在 `runIndexing()` 的参数里。

最小示例：

```ts
import { fileURLToPath } from "node:url";

import {
  createJsonlTraceExporter,
  createRAGObserver,
} from "@monai-ragsdk/observability";
import {
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  runIndexing,
} from "@monai-ragsdk/indexing";

const traceFilePath = fileURLToPath(
  new URL("./.artifacts/indexing-trace.jsonl", import.meta.url),
);

const observer = createRAGObserver({
  serviceName: "indexing-demo",
  environment: "local-demo",
  exporters: [
    createJsonlTraceExporter({
      filePath: traceFilePath,
      append: false,
    }),
  ],
});

const result = await runIndexing({
  loader: {
    async load() {
      return [
        {
          id: "demo/doc-1",
          content: "Indexing demo document",
          metadata: {
            source: "demo",
          },
        },
      ];
    },
  },
  chunker: new SimpleChunker({ chunkSize: 80, overlap: 10 }),
  embedder: new MockEmbedder({ dimension: 6 }),
  store: new MemoryVectorStore(),
  observer,
  trace: {
    dataset: "indexing-demo",
    version: "v1",
    tags: {
      scenario: "indexing-jsonl-demo",
    },
  },
});

await observer.shutdown?.();
```

说明：

- `observer` 直接放在 `runIndexing()` 的 options 里。
- `trace` 当前支持 `traceId`、`dataset`、`version` 和 `tags`。
- `indexing` 会按阶段发出 `indexing.load.start`、`indexing.chunk.complete`、`indexing.embed.complete`、`indexing.run.complete` 等事件，并在结束时导出最终 trace。

## 4. 当前仓库里的现成示例

当前仓库已经有一个可直接运行的 indexing 示例：

- `packages/indexing/demo/run-indexing.ts`

运行命令：

```bash
pnpm --filter @monai-ragsdk/indexing demo:run-indexing
```

该示例会：

- 执行一条最小 indexing 流程
- 通过 `createJsonlTraceExporter()` 把 trace 写到 `packages/indexing/demo/.artifacts/run-indexing-trace.jsonl`
- 在终端直接打印生成的 JSONL 内容

## 5. 常见约定

### 1. 为什么要调用 `observer.shutdown?.()`

当前 `createJsonlTraceExporter()` 虽然没有复杂的后台线程，但 observer / exporter 体系设计上保留了生命周期方法。

在 demo、脚本和服务关闭阶段显式调用：

```ts
await observer.shutdown?.();
```

可以保证后续即使 exporter 增加更复杂实现，也不需要再回头改接线方式。

### 2. JSONL 文件里会写什么

当前每一行都是一个完整的 `RAGTrace` JSON 对象。

其中通常包含：

- trace 基本字段：`traceId`、`scope`、`startedAt`、`endedAt`、`durationMs`、`status`（`startedAt` / `endedAt` 为 Unix 毫秒时间戳）
- trace 上下文：`serviceName`、`environment`、`dataset`、`version`、`tags`
- 事件数组：`events`（`timestamp` 为 Unix 毫秒时间戳）
- 错误数组：`errors`，仅在失败或显式记录错误时出现（`timestamp` 同上）

### 3. 当前更适合什么场景

当前最适合：

- 本地 demo
- 本地调试
- AI / 开发者交接时保留最小 trace 样本
- 验证 `runtime` / `indexing` 是否正确发出了观测事件

当前还不适合：

- 正式生产链路的集中化观测后端
- 高吞吐 trace 聚合
- 需要 redaction / sampling / retention 策略的场景

## 6. 下一步自然扩展

如果后续要继续扩 observability，当前最自然的顺序是：

1. 补 `HTTP` exporter
2. 为 `runtime` 增加和 `indexing` 对称的 JSONL demo
3. 在根级 integration / smoke 中增加对 trace 文件输出的显式断言
