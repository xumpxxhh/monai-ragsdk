# `@monai-ragsdk/runtime` — 现状

> 快照：**2026-08-20** · 状态：**可用**（四段 pipeline、routeDecision、官方装配）
> 源码：`packages/runtime/` · 用法：[README](../../packages/runtime/README.md)
> 回：[routing.md](./routing.md)
> 历史修复记录（可选）：[ai-handoff.md](../context/ai-handoff.md)

## 1. 定位

在线 RAG 内核。把 **pre-retrieval → retrieval → post-retrieval → generation** 串成可组合 pipeline，并提供知识库门面 MVP `createCollection()`。

策略件本体在本包；厂商 LLM / 向量库实现在 [adapters](./adapters.md)。

依赖：`core`、`observability`、`indexing`（`createCollection().ingest()` 调 `runIndexing`；另提供 indexing 查询协议）。不是误引。

被谁用：`adapters`、`apps/cli`、`apps/example`、`apps/server`。

## 2. 边界

- Active RAG / 自纠错循环 **冻结**。
- 不做答案内标记解析。
- 不补 Chroma 查询，不新增第二查询路径。
- 不要为 CLI / 控制台体验回头改本包边界。
- 不删 `route` / `strategy` / `indexingMode` 等历史字段；`iterative` 路由形态不在公开类型中。

## 3. 运行入口

| API | 行为 |
| --- | --- |
| `createRuntimeFromConfig()` | **推荐。** 从 query / postRetrieval / retriever / generator 编译 Runtime；默认包一层 FanOut；官方 post 顺序 |
| `createDefaultRuntime()` / `createRuntime()` | 原子拼装。缺省 preprocessor = `NoopQueryPreprocessor`，postprocessor = `PassthroughRetrievalPostprocessor` |
| `runtime.run()` | 完整问答 |
| `runtime.search()` | 只跑前三阶段，无 answer |
| `runtime.runStream()` | 检索一次性完成，只对流式 generation；无 `generateStream` 时回退为单段答案 |
| `runtime.close()` | 调 `retriever.close?.()` |

`createRuntimeFromConfig` 的官方 post 顺序：

`llm-rerank → score-threshold → predicate → dedupe → budget-trim → source-coverage → ordering → compression → lost-in-the-middle`

`rerank` / `compression` / `lostInTheMiddle` 只有显式配置才插入。历史 `PassthroughRetrievalPostprocessor` **未改顺序**（仍以 threshold 开头、不含 rerank）。

实现 `RuntimeRetriever` 时从 **`@monai-ragsdk/runtime/contract`** 引用 `createIndexingRetrievalCandidate`、`filterRetrievalCandidatesByIndexingFilters`、`fuseByReciprocalRankFusion`、`enforceRetrievalRequestFilters`。这些符号已从包根撤出。

条数语义：`budget.maxChunks` 为权威；`topK` 为单向别名（写入 budget，不反向覆盖）。

## 4. 各阶段现状

### 4.1 Pre-retrieval

经 `StrategyQueryPreprocessor` 串联 `QueryStrategy`：

| 策略 | 行为 | 消费情况 |
| --- | --- | --- |
| `query-rewrite` | 改写 `effectiveQuery`，不改 `originalQuery` | 下游检索读 effectiveQuery |
| `query-expansion` | 相关查询写入 `subQueries` | FanOut 多路 |
| `query-decomposition` | 拆成可独立检索的子问题 | FanOut 多路 |
| `multi-query` | 同一意图多种措辞 | FanOut 多路 |
| `query-routing` | 写出 `routeDecision`（targets / skip / searchType）以及可选 `route` / budget / filters | FanOut 消费 targets/skip；pgvector 消费 searchType；`route` 仍是 debug |

LLM 策略默认失败透传（`onError: 'throw'` 可硬失败）。空 `effectiveQuery` 不调模型。routing 没有可用 route **且没有** `routeDecision` 时整单透传，不写 `rewriteReason`。工厂：`createLlmRoutingStrategy` / `createRuleBasedRoutingStrategy`；`createQueryRoutingStrategy` 仍可用（内部 `LlmRoutingResolver`）。

### 4.2 Retrieval

- `FanOutRetriever` 读 `subQueries` 与 `routeDecision`。无 subQueries 且无 targets 时退化为只调 `#retrievers[0]`。`retrievalMode: skip` 或 `targets: []` 或不匹配的 targets：**不调子 retriever**，`candidates: []`，`retrievalMetadata.skipped: true`，禁止回退 `[0]`。
- 编排层在 retrieve **之后**调用 `enforceRetrievalRequestFilters`。langchain 的 `filterByRequest: false` 只表示 adapter 不预过滤，runtime 仍强制过滤。
- `RuntimeRetriever` 可选 `id` / `name` / `capabilities.searchTypes` / `close()`。pgvector 默认 `id: pgvector`、`searchTypes: ['vector', 'keyword', 'hybrid']`，并按 `routeDecision.searchType` 切换召回。
- `RetrievalRequest.routeDecision` 由 query-routing 写入；searchType 原样下传，FanOut 不改融合算法。

### 4.3 Post-retrieval

已有策略：score-threshold、predicate、near-duplicate、budget-trim、source-coverage、candidate-ordering、llm-rerank、context-compression、lost-in-the-middle。

**分数口径与阈值：**

- `RetrievalCandidate.scoreKind`：`retriever` | `rrf` | `llm`
- 阈值：无 kind / 混口径 / `expectedScoreKind` 不符 → **拒绝比较、整批透传**，不静默全丢
- `llm-rerank`：零候选不调模型；失败不写 `request.rerank`；写回分标 `llm`

`appliedStrategies` 只在非透传时写入；observer 仍打 `outcome: passthrough`。

### 4.4 Generation

**没有策略层。** 接口是 `generate` / 可选 `generateStream`。

`RuntimeGeneratorInput.grounding?` 仅在 `chunks.length === 0` 时出现：

| `chunksEmptyReason` | 含义 | runtime 会不会写 |
| --- | --- | --- |
| `no-hits` | 检索 0 条 | 会 |
| `filtered` | 检索有条、post 滤光 | 会 |
| `skipped` | 主动跳过检索 | **会**（`retrievalMode: skip` 或 FanOut `retrievalMetadata.skipped`） |

内置 openai / langchain / ollama generator **不改拒答策略**；字段只让策略可表达。控制台 `noGroundingPolicy` 目前不会在内核生效。

`run()` 允许空字符串答案；`runStream()` 对空答案抛错。这是刻意历史分叉，尚未统一。

## 5. Collection MVP

`createCollection({ indexing, runtime })` 只做编排：

- `ingest` → 临时 in-memory Loader → `runIndexing`
- `search` / `ask` → runtime
- `listSources` / `deleteByFilters` / `close`：直接探测 store 可选方法；未实现时返回空 / `false`，不当错误抛出

不要新开 kb 包，也不要在这里扩展完整文档生命周期。

## 6. 关键入口

| 路径 | 职责 |
| --- | --- |
| `src/pipeline/create-runtime-from-config.ts` | 官方装配 |
| `src/pipeline/run-runtime.ts` | 三路径编排（仍约 890 行，职责过载） |
| `src/contract/index.ts` | adapter 契约工具 |
| `src/stages/pre-retrieval/strategies/` | QueryStrategy |
| `src/stages/pre-retrieval/strategies/routing/` | LLM / 规则 RoutingResolver |
| `src/stages/post-retrieval/strategies/` | PostRetrievalStrategy |
| `src/stages/retrieval/fan-out-retriever.ts` | 多路 + RRF |
| `src/stages/generation/resolve-generation-grounding.ts` | 空依据成因 |
| `src/collection/create-collection.ts` | 门面 MVP |
| `src/observation/` | 内部打点（不从包根泄漏） |

## 7. 测试

```powershell
pnpm --filter @monai-ragsdk/runtime build
pnpm --filter @monai-ragsdk/runtime test
```

adapters 依赖 runtime 的 `/contract` 类型，改 runtime 后需先 build 再跑 adapters 测试。

## 8. 残留风险（改本包前必读）

- 手写 candidate 只给 `score` 不给 `scoreKind` 时，阈值拒绝比较（全留）。这是故意的。
- 阈值与口径匹配仍靠调用方；未设 `expectedScoreKind` 时，同口径按绝对值比（RRF 配 0.2 仍会全丢）。
- langchain 仍不读 `budget.maxChunks`。
- 自定义 retriever 可不设 `id`，`routeDecision.targets` 匹配不到（无匹配时 skip，不回退 `[0]`）。
- `mergeSelectionTrace` 按 chunkId 覆盖，无法还原完整决策链。
- 包外若仍从包根 import `applyScoreThresholdStrategy` 等内部 helper 会编译失败。
- 死字段仍在：`route` / `strategy` / `indexingMode` / `metadata` / `rerank.topK`（debug 或未消费）。
- `run-runtime.ts` 尚未拆分；`exports.spec.ts` 仍用 src/dist 键集合 `toEqual` 对齐。

## 9. 已知缺口

1. 工程：拆 `run-runtime.ts`；与 core 双接口；selectionTrace 历史
2. 产品：内置 generator 消费 `grounding`（无依据拒答 vs 用模型知识）

Active RAG 仍在冻结范围，不作为默认改进项。

## 10. 关联

- [kernel-contract-defects.md](../decisions/kernel-contract-defects.md) — 病根归档（部分症状已修，文档状态仍可能写「草案」）
- [query-routing-semantics.md](../decisions/query-routing-semantics.md)
- [indexing.md](./indexing.md) · [adapters.md](./adapters.md) · [observability.md](./observability.md)
