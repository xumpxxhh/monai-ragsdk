# packages 现状 Wiki — 路由

> 快照日期：**2026-08-24**
> 范围：仅 `packages/*`（`@monai-ragsdk/*` 库）。不含 `apps/`。
> 用法：先查本页「按问题选文档」，再进对应包页。用法示例仍以各包 README 为准。

本目录是内核知识库，记录**现在做到哪、边界在哪、缺口是什么**。包内 README 管「怎么用」；`docs/decisions/` 管「为什么这样设计」。

维护约定见项目规则 [`.cursor/rules/packages-wiki.mdc`](../../.cursor/rules/packages-wiki.mdc)：改 `packages/` 须回写对应包页与本路由。

---

## 按问题选文档

| 你想查什么                                         | 去哪                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 包依赖方向、整体就绪度、已知缺口与优先级           | 本页下方                                                                                                      |
| Query / Chunk / RAGResponse schema、最小 Retriever | [core.md](./core.md)                                                                                          |
| 离线 ingest、增量 skip/replace、VectorStore        | [indexing.md](./indexing.md)                                                                                  |
| 在线四段 pipeline、策略、Collection、契约          | [runtime.md](./runtime.md)                                                                                    |
| 事件名、traceId、exporter、失败隔离                | [observability.md](./observability.md)                                                                        |
| OpenAI / Ollama / pgvector / LangChain / Chroma    | [adapters.md](./adapters.md)                                                                                  |
| 评测 dataset / 检索指标 / diff / 生成 judge / unscorable | [eval.md](./eval.md)；设计 [rag-eval-architecture.md](../decisions/rag-eval-architecture.md)；对接 [eval-handoff.md](../context/eval-handoff.md) |
| 公共工具函数是否已开工                             | [utils.md](./utils.md)                                                                                        |
| score 口径、死字段、filters 行为                   | [runtime.md](./runtime.md) §4；病根归档 [kernel-contract-defects.md](../decisions/kernel-contract-defects.md) |
| Query Routing 行为与消费点                         | [runtime.md](./runtime.md) §4.1–4.2；设计见 [query-routing-upgrade.md](../decisions/query-routing-upgrade.md) |
| 无依据拒答 / 泛化（grounding policy）              | [runtime.md](./runtime.md) §4.4；[generation-grounding-policy.md](../decisions/generation-grounding-policy.md) |

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
- 应用层（`apps/example`、`apps/server`、`apps/web`）可以依赖以上任意包；**本 Wiki 不跟踪 apps。**

循环依赖：**未发现**。

---

## 现状一览

| 包                                  | npm 名                        | 角色          | 状态     | 就绪判断                                                               |
| ----------------------------------- | ----------------------------- | ------------- | -------- | ---------------------------------------------------------------------- |
| [core](./core.md)                   | `@monai-ragsdk/core`          | 共享契约      | **稳定** | schema / 错误基类可用；与 runtime 双份 Retriever 未收敛                |
| [observability](./observability.md) | `@monai-ragsdk/observability` | 观测协议      | **稳定** | 事件 + JSONL/console/memory 可用；不接 OTLP                            |
| [indexing](./indexing.md)           | `@monai-ragsdk/indexing`      | 离线索引内核  | **可用** | full / incremental 完整；Loader 无内置实现                             |
| [runtime](./runtime.md)             | `@monai-ragsdk/runtime`       | 在线 RAG 内核 | **可用** | 四段编排 + 官方装配；generation 无策略链，有 grounding policy 包装器；routing 消费 `routeDecision` |
| [adapters](./adapters.md)           | `@monai-ragsdk/adapters`      | 厂商适配      | **可用** | 默认栈官方 openai SDK + pgvector；Chroma 只写不查                      |
| [eval](./eval.md)                   | `@monai-ragsdk/eval`          | 评测算子      | **可用** | golden + 检索指标 + diff + 生成 judge 协议；在线抽样 harness 在 apps，见 [eval-handoff.md](../context/eval-handoff.md) |
| [utils](./utils.md)                 | `@monai-ragsdk/utils`         | 工具占位      | **空包** | `export {}`，未授权实现                                                |

版本均为 `0.1.0`，`private: true`。

---

## 内核主路径（现在能跑什么）

离线：

`Loader → transform → filter → chunk → chunk-transform → metadata → chunk-filter → embed → upsert`（incremental 另做 fingerprint skip / replace / stale delete）

在线：

`pre-retrieval → retrieval → post-retrieval → generation`

入口：

| 需求                       | API                                          | 包                            |
| -------------------------- | -------------------------------------------- | ----------------------------- |
| 按配置编译 Runtime（推荐） | `createRuntimeFromConfig()`                  | runtime                       |
| 原子拼装                   | `createDefaultRuntime()` / `createRuntime()` | runtime                       |
| 只检索不生成               | `runtime.search()`                           | runtime                       |
| 知识库门面 MVP             | `createCollection()`                         | runtime（ingest 调 indexing） |
| 离线索引                   | `runIndexing()`                              | indexing                      |
| 实现 Retriever 的契约工具  | `@monai-ragsdk/runtime/contract`             | runtime                       |

默认查询栈在 **adapters**：OpenAI 兼容 embedding / chat + pgvector。Ollama 可选。Chroma 不是查询路径。

---

## 横切事实（改内核前先读）

1. **分数与阈值**：`RetrievalCandidate` 带 `scoreKind`（`retriever` | `rrf` | `llm`）；`score-threshold` 在口径未知或混用时拒绝比较；`llm-rerank` 零候选时不调模型。详见 [runtime.md](./runtime.md) §4.3。
2. **filters**：retrieve 之后编排层强制 `enforceRetrievalRequestFilters`；adapter 可不预过滤，runtime 仍会丢弃不匹配候选。详见 [runtime.md](./runtime.md) §4.2。
3. **装配与导出**：推荐 `createRuntimeFromConfig`；官方 post-retrieval 顺序见 runtime §3；Retriever 契约工具在 `@monai-ragsdk/runtime/contract`，不在包根。
4. **Query routing**：`query-routing` 写入 `routeDecision`（`targets` / `skip` / `searchType`）；FanOut 消费 targets/skip；pgvector 按 searchType 切换召回；`request.route` 仅 debug。不配 routing 策略则行为与以前相同。
5. **generation**：无完整策略链；`grounding.chunksEmptyReason` 为信号；产品拒答/泛化用 `createGroundingPolicyRuntimeGenerator`（runtime），adapters 厂商 generator 不消费。
6. **Active RAG / 答案内标记解析 / 第二查询路径 / OTLP** 是边界，不是欠债。
7. **eval 为零依赖叶子包**：golden 契约、检索指标、diff 与生成 judge 协议在 `packages/eval`；批量跑分与在线抽样 harness 在 `apps/server`（见 [eval-handoff.md](../context/eval-handoff.md)）。`utils` 仍保持空。

历史修复记录（可选）：[ai-handoff.md](../context/ai-handoff.md)（内核契约）、[eval-handoff.md](../context/eval-handoff.md)（评测）。

---

## 已知缺口与优先级（packages）

| 优先级  | 事项                                                                          | 落点                                        |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| P2 工程 | 拆 `run-runtime.ts`；收敛 core/runtime 双接口；`mergeSelectionTrace` 保留历史 | runtime / core                              |
| P2 工程 | langchain retriever 读取 `budget.maxChunks`                                   | adapters                                    |
| 冻结    | Active RAG、Chroma 查询、utils 预堆工具                                        | —                                           |

`apps/server` 的 `pipeline-factory` 仍手拼且 rerank 在 threshold 之后——那是应用层，不在本 Wiki 范围，但改它应调用 runtime 的 `createRuntimeFromConfig`，不要在 apps 再发明顺序。

---

## 包页索引

- [core — 共享契约](./core.md)
- [observability — 可观测协议](./observability.md)
- [indexing — 离线索引内核](./indexing.md)
- [runtime — 在线 RAG 内核](./runtime.md)
- [adapters — 外部适配](./adapters.md)
- [eval — 评测算子](./eval.md)（对接：[eval-handoff.md](../context/eval-handoff.md)）
- [utils — 工具占位](./utils.md)

能力地图原文（「应该有什么」，不是「已经有什么」）：[refer.md](../refer.md)。
