# packages 现状 Wiki — 路由

> 快照日期：**2026-08-19**
> 范围：仅 `packages/*`（`@monai-ragsdk/*` 库）。不含 `apps/`。
> 用法：先查本页「按问题选文档」，再进对应包页。用法示例仍以各包 README 为准。

本目录是内核知识库，记录**现在做到哪、边界在哪、下一步不该碰什么**。包内 README 管「怎么用」；`docs/decisions/` 管「为什么这样设计」。

维护约定见项目规则 [`.cursor/rules/packages-wiki.mdc`](../../.cursor/rules/packages-wiki.mdc)：改 `packages/` 须回写对应包页与本路由。

---

## 按问题选文档

| 你想查什么 | 去哪 |
| --- | --- |
| 包依赖方向、整体就绪度、下一刀优先级 | 本页下方 |
| Query / Chunk / RAGResponse schema、最小 Retriever | [core.md](./core.md) |
| 离线 ingest、增量 skip/replace、VectorStore | [indexing.md](./indexing.md) |
| 在线四段 pipeline、策略、Collection、契约切片 | [runtime.md](./runtime.md) |
| 事件名、traceId、exporter、失败隔离 | [observability.md](./observability.md) |
| OpenAI / Ollama / pgvector / LangChain / Chroma | [adapters.md](./adapters.md) |
| 评测是否已开工 | [eval.md](./eval.md) |
| 公共工具函数是否已开工 | [utils.md](./utils.md) |
| score 口径、死字段、filters 静默失效（已修） | [kernel-contract-defects.md](../decisions/kernel-contract-defects.md) + [ai-handoff.md](../context/ai-handoff.md) |
| Query Routing 怎么落地 | [query-routing-upgrade.md](../decisions/query-routing-upgrade.md)（**已落地**：FanOut 消费 skip/targets，pgvector 消费 searchType） |

---

## 依赖方向（只允许向下）

```
core
  └── observability
        └── indexing
              └── runtime
                    └── adapters
```

- `eval`、`utils`：无 workspace 依赖，也没有任何包依赖它们。
- `adapters` 不依赖 `observability`：厂商适配只做事，trace 由 indexing / runtime 上报。
- 应用层（`apps/cli`、`apps/example`、`apps/server`）可以依赖以上任意包；**本 Wiki 不跟踪 apps。**

循环依赖：**未发现**。

---

## 现状一览

| 包 | npm 名 | 角色 | 状态 | 就绪判断 |
| --- | --- | --- | --- | --- |
| [core](./core.md) | `@monai-ragsdk/core` | 共享契约 | **稳定** | schema / 错误基类可用；与 runtime 双份 Retriever 未收敛 |
| [observability](./observability.md) | `@monai-ragsdk/observability` | 观测协议 | **稳定** | 事件 + JSONL/console/memory 可用；不接 OTLP |
| [indexing](./indexing.md) | `@monai-ragsdk/indexing` | 离线索引内核 | **可用** | full / incremental 完整；Loader 无内置实现 |
| [runtime](./runtime.md) | `@monai-ragsdk/runtime` | 在线 RAG 内核 | **可用** | 四段编排 + 官方装配；generation 无策略层；routing 已消费 `routeDecision` |
| [adapters](./adapters.md) | `@monai-ragsdk/adapters` | 厂商适配 | **可用** | 默认栈 OpenAI 兼容 + pgvector；Chroma 只写不查 |
| [eval](./eval.md) | `@monai-ragsdk/eval` | 评测占位 | **空包** | `export {}`，未授权落地 |
| [utils](./utils.md) | `@monai-ragsdk/utils` | 工具占位 | **空包** | `export {}`，未授权落地 |

版本均为 `0.1.0`，`private: true`。

---

## 内核主路径（现在能跑什么）

离线：

`Loader → transform → filter → chunk → chunk-transform → metadata → chunk-filter → embed → upsert`（incremental 另做 fingerprint skip / replace / stale delete）

在线：

`pre-retrieval → retrieval → post-retrieval → generation`

入口：

| 需求 | API | 包 |
| --- | --- | --- |
| 按配置编译 Runtime（推荐） | `createRuntimeFromConfig()` | runtime |
| 原子拼装 | `createDefaultRuntime()` / `createRuntime()` | runtime |
| 只检索不生成 | `runtime.search()` | runtime |
| 知识库门面 MVP | `createCollection()` | runtime（ingest 调 indexing） |
| 离线索引 | `runIndexing()` | indexing |
| 实现 Retriever 的契约工具 | `@monai-ragsdk/runtime/contract` | runtime |

默认查询栈在 **adapters**：OpenAI 兼容 embedding / chat + pgvector。Ollama 可选。Chroma 不是查询路径。

---

## 横切事实（改内核前先读）

1. **契约切片 A–G 已收口**（2026-08-19）。score 口径、filters 强制点、官方装配层、`/contract` 子路径都在 runtime。细节见 [runtime.md](./runtime.md) 与 [ai-handoff.md](../context/ai-handoff.md)。
2. **`routeDecision` 已落地。** `request.route` 仍是 debug。FanOut 消费 `targets` / `skip`；pgvector 按 `searchType` 切换召回。不配 routing 策略则行为与以前相同。
3. **generation 没有策略层。** `grounding.chunksEmptyReason` 只是信号；内置 generator 不拒答。
4. **Active RAG / 答案内标记解析 / 第二查询路径 / OTLP** 是边界，不是欠债。
5. **eval / utils 保持空。** 可复用逻辑先落在已授权的五个包里。

---

## 建议的下一刀（只谈 packages）

按「用户可感知 / 正确性」优先，工程洁癖靠后：

| 优先级 | 事项 | 落点 |
| --- | --- | --- |
| P1 产品 | 内置 generator 消费 `grounding`（无依据拒答 vs 用模型知识） | runtime 信号已有；行为在 adapters generator |
| P2 工程 | 拆 `run-runtime.ts`；收敛 core/runtime 双接口；`mergeSelectionTrace` 保留历史 | runtime / core |
| P2 工程 | langchain retriever 读取 `budget.maxChunks` | adapters |
| 冻结 | Active RAG、eval 实现、Chroma 查询、utils 预堆工具 | — |

`apps/server` 的 `pipeline-factory` 仍手拼且 rerank 在 threshold 之后——那是应用层，不在本 Wiki 范围，但改它应调用 runtime 的 `createRuntimeFromConfig`，不要在 apps 再发明顺序。

---

## 包页索引

- [core — 共享契约](./core.md)
- [observability — 可观测协议](./observability.md)
- [indexing — 离线索引内核](./indexing.md)
- [runtime — 在线 RAG 内核](./runtime.md)
- [adapters — 外部适配](./adapters.md)
- [eval — 评测占位](./eval.md)
- [utils — 工具占位](./utils.md)

能力地图原文（「应该有什么」，不是「已经有什么」）：[refer.md](../refer.md)。
