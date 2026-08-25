# `@monai-ragsdk/example`

## 定位

可运行的完整流程示例，用来对照默认栈和策略组合，不是 SDK 的一部分，也不对外发布。

组装的是已落地能力：indexing → pgvector → runtime（含流式生成、pre/post 策略、observer）。不演示 Active RAG，也不走 Chroma 查询。

## 依赖

- `@monai-ragsdk/adapters`
- `@monai-ragsdk/indexing`
- `@monai-ragsdk/runtime`
- `@monai-ragsdk/observability`

## 示例

| id               | 说明                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `basic-stream`   | 默认栈闭环：索引 → pgvector → 流式生成（无策略，含 observer）           |
| `pre-retrieval`  | Rewrite + Multi-Query + FanOut                                          |
| `post-retrieval` | Rerank + Compression + Lost-in-the-Middle                               |
| `full-pipeline`  | Query Routing：LLM routeDecision + FanOut targets + pgvector searchType |
| `observability`  | 对照前后策略 + FanOut，重点看 trace 事件                                |

各示例会把 observer 接到 runtime：不传 `requestId` / `trace.traceId` 时内核用 UUID 生成关联键。完整策略链的事件形状可对照 `src/observability-trace.full-pipeline.json`。字段约定见 `packages/observability/README.md`。

## 使用方式

需要本机 pgvector，以及 embedding / chat 的 API Key。embedding 设 `EMBEDDING_API_KEY`，ask 设 `OPENAI_API_KEY`。连接与模型可用环境变量覆盖，见 `src/shared/example-config.ts`。

在仓库根目录：

```bash
pnpm example
pnpm --filter @monai-ragsdk/example start list
pnpm --filter @monai-ragsdk/example start basic-stream
pnpm --filter @monai-ragsdk/example start pre-retrieval
pnpm --filter @monai-ragsdk/example start post-retrieval
pnpm --filter @monai-ragsdk/example start full-pipeline
pnpm --filter @monai-ragsdk/example start observability
pnpm --filter @monai-ragsdk/example start all
```

兼容：`EXAMPLE=full-pipeline pnpm --filter @monai-ragsdk/example start`。

## 边界

- 不要为了示例体验回头改 SDK 边界。
- 不要在示例里引入第二套存储 / 查询路径。
- 可运行应用见 `apps/web`、`apps/server`。
