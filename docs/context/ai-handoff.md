# 内核契约缺陷 — 修复对接

> 状态：**切片 A–G 已落地**
> 日期：2026-08-19
> 诊断原文：[kernel-contract-defects.md](../decisions/kernel-contract-defects.md)
> 关联：[query-routing-upgrade.md](../decisions/query-routing-upgrade.md)（**已落地**）
> 范围：`packages/`；不含 `apps/`
> 各包现状 Wiki：[packages/routing.md](../packages/routing.md)（按包查阅，不替代本文的切片约定）

下一轮 Agent 读完本文即可开工，不必再通读诊断全文。实现时以诊断为证据、以本文为范围与约定。

---

## 当前结论（必须遵守）

1. 死字段（`request.route` 等）是病根外显，不是第一刀该砍的点。先修**正确性**，再收敛契约。
2. **不要**现在往 `RetrievalRequest` 加 `routeDecision`。三个字段都缺前置：`skip` 依赖缺口 1；`targets` / `searchType` 依赖 retriever 身份与能力声明。
3. **不要**本轮收窄 `packages/runtime` export 面，也**不要**为了洁癖去改 `exports.spec.ts` 第 19 行的 `toEqual`。P0 只加可选字段，不触发高危项 7。
4. 一次只做**一个切片**。做完后回写本文「进度」与「下一刀」。

---

## 切片顺序

| 切片 | 对应诊断 | 破坏 export 面 | 本轮是否做 |
| --- | --- | --- | --- |
| **A. score 口径 + llm-rerank 正确性** | P0 两项 | 否（加字段） | **已完成** |
| **B. generation 无依据成因** | P1 缺口 1 | 否（加字段） | **已完成** |
| **C. RetrievalRequest 字段收敛** | P1 | 否（JSDoc + 新导出 helper；未删字段、未改 `toEqual`） | **已完成** |
| **D. RuntimeRetriever 契约补全** | P1 | 否（接口加可选字段 + 新导出） | **已完成** |
| **E. 官方装配层** | P2 缺口 2 | 否（新增 API） | **已完成** |
| **F. 契约工具分层 + 收窄 export** | P2 / 高危项 7 | 是（改断言清单；`toEqual` 仍比 src/dist 键） | **已完成** |
| **G. 中低严重项打包** | 中等 / 低 | 否 | **已完成** |

切片 A 做完即可让 `score-threshold` 与观测口径可信，并堵住 rerank 的脏审计 / 空调用。B 可与 A 并行（仅加字段），但**不要塞进同一 PR**，避免 generator 输入变更与阈值语义搅在一起。

C / D 是 query-routing-upgrade 的真正前置；完成 D 之前不要实现 `targets` / `searchType`。

---

## 切片 A — 要改什么

目标（验收）：

1. `RetrievalCandidate` 自带分数口径；post-retrieval 与 observability 读候选上的口径，不再靠 `provider === 'fan-out'` 猜。
2. `score-threshold` 不再用同一绝对值去比较不同口径；口径不匹配时**拒绝执行比较**（透传候选并留下可观测原因），而不是静默「全丢 / 全留」。
3. pgvector 内部 RRF 的候选标成 `rrf`，观测不再标成 `retriever`。
4. `llm-rerank`：零候选短路；仅成功重排后才写 `request.rerank`；LLM 写回的分标成 `llm`。

### A1. 口径类型落在决策对象上

把口径从观测层下沉到 `RetrievalCandidate`。

- 新类型放在 `packages/runtime/src/types/retrieval-candidate.ts`（决策层是源头，观测层不是）：

```ts
export type RetrievalScoreKind = 'retriever' | 'rrf' | 'llm';

export type RetrievalCandidate = {
  chunk: Chunk;
  score?: number;
  /** 与 score 同生同灭；有 score 时实现方应写入。缺失视为未知，不得当 retriever 分用。 */
  scoreKind?: RetrievalScoreKind;
  // ...
};
```

- `ObservationScoreKind`（`build-observation-attributes.ts`）改为 `RetrievalScoreKind` 的别名，避免两套枚举。
- `CreateIndexingRetrievalCandidateOptions` 增加可选 `scoreKind`，`createIndexingRetrievalCandidate` 原样拷到 candidate。
- `fuseByReciprocalRankFusion` 产出的融合分一律视为 `rrf`：在 `enrichCandidate` 默认路径或融合函数返回时写入 `scoreKind: 'rrf'`（pgvector 与 FanOut 都走这条函数，一处盖住两处误判）。

写入点（必须盖到）：

| 生产者 | 应写的 kind |
| --- | --- |
| `fuseByReciprocalRankFusion` / FanOut 融合结果 | `rrf` |
| `PgVectorRuntimeRetrieverAdapter` 融合后候选 | `rrf`（融合函数写即可，adapter 勿再猜） |
| `LangchainRuntimeRetrieverAdapter` 的 `document.score` | `retriever` |
| `llm-rerank` 写回 LLM 分 | `llm`（其余未写回的候选保持原 `score` + 原 `scoreKind`） |
| demo / 测试里手写 candidate | 有 score 就写 kind；旧测试补字段 |

删除（或降为兜底）`run-runtime.ts` 的 `retrievalScoreKind()`：`summarizeCandidates` **优先读** `candidate.scoreKind`；仅当整批都缺 kind 时才允许按 metadata 推断，且 **pgvector 不得再被当成 retriever**。推断规则若仍保留：`provider === 'fan-out'` → `rrf`；`provider === 'pgvector'` 且存在融合计数类 metadata → `rrf`；其它 → 不写 kind（未知优于写错）。

### A2. `score-threshold` 按口径执行或拒绝

文件：`post-retrieval-strategies.ts` 的 `applyScoreThresholdStrategy`、`score-threshold-strategy.ts`。

约定（兼容旧测试、修正确性）：

- 未配置 `scoreThreshold`：行为不变。
- 配置了阈值时：
  - **无 score 的候选**：不因阈值丢弃（与现逻辑一致）。
  - **有 score 但无 `scoreKind`**：视为口径未知 → **整批拒绝执行阈值**（全部 selected，trace reason 用 `score-kind-unknown`），不要假装它是余弦分。这会改变「旧测试裸 score + 阈值」的断言，**允许改测试**：旧 `defaults.spec.ts` 里那组 `0.8 / 0.2 / 0.5` 应补 `scoreKind: 'retriever'`，而不是放宽策略去迁就未知口径。
  - **整批有 score 的候选 `scoreKind` 不一致**（例如混有 `rrf` 与 `llm`）：拒绝执行，reason `score-kind-mismatch`。
  - **同口径**：维持 `score < threshold` 则 drop。不在内核做 RRF↔余弦换算。
- 策略配置可增加可选 `expectedScoreKind`。若设置且实际口径不同：拒绝执行（reason `score-kind-unexpected`），避免「按余弦配的 0.2 打在 RRF 上」。未设置时：只要同口径就比较，由调用方保证阈值与口径匹配。
- 拒绝执行时：`appliedScoreThreshold` 仍可记录意图值，但必须能从 `selectionTrace` / observation 看出**未比较**。不要在 debug 里表现成「已按该阈值过滤」。

默认链（`passthrough-retrieval-postprocessor.ts`）本轮**不改顺序**，也不把 `llm-rerank` 塞进默认链。顺序依赖是切片 E / 中等项 4 的事。

### A3. `llm-rerank` 正确性

文件：`packages/runtime/src/stages/post-retrieval/strategies/llm-rerank-strategy.ts`。

1. **零候选短路**：`candidates.length === 0`（或 `subset.length === 0`）时直接透传，不 `model.complete`。对照 `context-compression-strategy.ts` 的短路写法。
2. **mutate 移入成功分支**：现在第 169–171 行在 try 之前改 `request.rerank`。应：
   - 失败 / 空文本 / 解析失败 / passthrough：**不改**传入 `request`；
   - 成功重排后：再写 `rerank.strategy = 'llm-rerank'`。
   - 优先返回新 request 或只在成功路径赋值；与其它策略「返回新对象」对齐。若必须 mutate，仅成功时 mutate。
3. 写回 LLM score 时带 `scoreKind: 'llm'`。
4. 补测试：零候选不调 model；失败路径 audit/debug 不得出现 `rerankStrategy: 'llm-rerank'`（若现有测试锁的是失败仍标记，一并改测试并在 PR 说明）。

### A4. 测试范围（只跑相关包，禁止无必要全量 lint）

至少覆盖：

- `packages/runtime/__tests__/defaults.spec.ts`：阈值用例补 `scoreKind`
- 新增或扩展：未知口径拒绝；混口径拒绝；`expectedScoreKind` 不匹配拒绝
- pgvector adapter spec：返回候选 `scoreKind === 'rrf'`
- `runtime-observer-strategies.spec.ts`：pgvector / 非 fan-out 的 RRF 不得再被标 `retriever`；优先读 candidate 上的 kind
- llm-rerank：空列表不调用 model；失败不写 `request.rerank`

建议命令（PowerShell）：

```powershell
pnpm --filter @monai-ragsdk/runtime test
pnpm --filter @monai-ragsdk/adapters test
```

只对改过的文件跑项目既有 lint/typecheck，不要全仓扫。

---

## 切片 B 及以后（只记边界，本轮不实现）

**B — 缺口 1**：给 `RuntimeGeneratorInput` 增加可选「无依据成因」，例如 `grounding: { chunksEmptyReason: 'no-hits' | 'filtered' | 'skipped' }`（名字实现时再定，语义这三种即可）。由 runtime 在调用 generator 前根据 retrieval / post-retrieval 结果填写。**没有这个字段时，不要实现 `retrievalMode: "skip"` 的完整产品语义。**

**C — 字段收敛**：统一条数语义（权威：`budget.maxChunks`；`topK` / `rerank.topK` 要么删除要么标明纯观测）。死字段（`route` / `strategy` / `indexingMode` / `metadata`）要么标明 debug-only，要么删除。须先开一份 export 面策略（改不改 `exports.spec.ts`）。

**D — RuntimeRetriever**：接口补 `id`/`name`、能力声明（searchType 等）、`close?`；`filters` 在 runtime 编排层强制应用，而不是 adapter 自愿。langchain 的 `filterByRequest: false` 不得再让观测假装 filters 生效。完成后才允许 `routeDecision.targets` / `searchType`。

**E — 装配层**：把 demo 和调用方重复的「策略数组手拼」收进官方 `createRuntimeFromConfig`（名称待定）。顺带声明 post-retrieval 顺序依赖（rerank 在 threshold 前才写回分）。

**F / G**：内部工具独立模块、收窄 barrel、拆 `run-runtime.ts`、`create-collection` 去掉 `as unknown as`、core/runtime 双接口、`appliedStrategies` 与 passthrough 口径等。均排在 A–D 之后。

---

## 关键文件地图

| 路径 | 切片 A 角色 |
| --- | --- |
| `packages/runtime/src/types/retrieval-candidate.ts` | 加 `scoreKind` |
| `packages/runtime/src/indexing/query-protocol.ts` | factory 透传 kind |
| `packages/runtime/src/stages/retrieval/fuse-by-rrf.ts` | 融合分标 `rrf` |
| `packages/runtime/src/stages/retrieval/fan-out-retriever.ts` | 确认走 fuse，不必重复猜 provider |
| `packages/runtime/src/stages/post-retrieval/strategies/post-retrieval-strategies.ts` | 阈值按口径 / 拒绝 |
| `packages/runtime/src/stages/post-retrieval/strategies/score-threshold-strategy.ts` | 可选 `expectedScoreKind` |
| `packages/runtime/src/stages/post-retrieval/strategies/llm-rerank-strategy.ts` | 短路 + 成功才写 rerank + `llm` 口径 |
| `packages/runtime/src/pipeline/run-runtime.ts` | 删掉错误的 `retrievalScoreKind` 推断 |
| `packages/runtime/src/observation/emit-runtime-observation.ts` | `summarizeCandidates` 读 candidate.scoreKind |
| `packages/adapters/src/pgvector/.../pg-vector-runtime-retriever-adapter.ts` | 确认融合后带 `rrf` |
| `packages/adapters/src/langchain/.../langchain-runtime-retriever-adapter.ts` | 写入 `retriever` |
| `packages/runtime/src/types/runtime-generator-input.ts` | **不要动**（属切片 B） |
| `packages/runtime/__tests__/exports.spec.ts` | **不要为收窄面改 toEqual**；若新导出类型被 barrel 带出，只需与 src/dist 键集合仍然一致 |

中文注释：公开函数与「拒绝执行阈值 / 失败不 mutate / 空列表短路」必须写清**为什么**，不要复述标识符。

---

## 进度

- [x] 诊断归档 `docs/decisions/kernel-contract-defects.md`
- [x] 本对接文档：切片划分与 A 的实现约定
- [x] 切片 A 实现 + 相关测试
- [x] 切片 B（generation 无依据成因）
- [x] 切片 D（RuntimeRetriever 身份 / 能力 / close / filters 强制点）
- [x] 切片 C：`topK` 别名补齐 + 字段职责标注（未删字段）
- [x] 切片 E：`createRuntimeFromConfig` 官方装配层
- [x] 切片 F：契约工具 `/contract` + 收窄包根
- [x] 切片 G：collection 探测、passthrough、appliedStrategies、routing rewriteReason

### 切片 A 实际落地

**行为**

- `RetrievalCandidate.scoreKind`：`retriever` | `rrf` | `llm`；`ObservationScoreKind` 是其别名。
- `fuseByReciprocalRankFusion` 返回值一律覆盖为 `scoreKind: 'rrf'`（pgvector / 默认 FanOut 都走这里）。
- langchain 默认路径：有 `document.score` 时标 `retriever`。
- `applyScoreThresholdStrategy`：有分无 kind → `score-kind-unknown`；混口径 → `score-kind-mismatch`；`expectedScoreKind` 不符 → `score-kind-unexpected`。拒绝时整批透传，`appliedScoreThreshold` 仍记录意图，trace metadata 带 `compared: false`。
- 观测：`summarizeCandidates` 优先读候选上的 kind；仅整批缺口径才用 metadata 推断。`provider === 'fan-out'` 或 pgvector 带 `fusedCandidateCount` → `rrf`；其它 **不再** 猜成 `retriever`。
- `llm-rerank`：空候选不调模型；失败不写 `request.rerank`；LLM 写回分标 `llm`。

**主要改动文件**

- `packages/runtime/src/types/retrieval-candidate.ts`
- `packages/runtime/src/types/post-retrieval-selection-trace.ts`（新增三个 reason）
- `packages/runtime/src/indexing/query-protocol.ts`
- `packages/runtime/src/stages/retrieval/fuse-by-rrf.ts`
- `packages/runtime/src/stages/retrieval/fan-out-retriever.ts`（不再强行给观测盖 `retriever`/`rrf`）
- `packages/runtime/src/stages/post-retrieval/strategies/post-retrieval-strategies.ts`
- `packages/runtime/src/stages/post-retrieval/strategies/score-threshold-strategy.ts`
- `packages/runtime/src/stages/post-retrieval/strategies/llm-rerank-strategy.ts`
- `packages/runtime/src/pipeline/run-runtime.ts`（`inferMissingScoreKind` 替换错误的 `retrievalScoreKind`）
- `packages/runtime/src/observation/emit-runtime-observation.ts`
- `packages/runtime/src/observation/build-observation-attributes.ts`
- `packages/adapters/src/langchain/retrievers/langchain-runtime-retriever-adapter.ts`
- 测试：`packages/runtime/__tests__/score-kind.spec.ts`（新）及 defaults / observer / llm-rerank / pgvector / langchain 等用例补 `scoreKind`

**验证**：`pnpm --filter @monai-ragsdk/runtime test`；先 `runtime` build 再 `pnpm --filter @monai-ragsdk/adapters test`。

**残留风险**

- 手写 candidate 仍只给 `score`、不给 `scoreKind` 时，阈值会**拒绝比较**（全留）。这是故意的；调用方 / demo / 自定义 retriever 需要补 kind。
- 自定义 FanOut `fuse` 若只做 concat、不走 RRF，观测不再假装 `rrf`。
- 阈值与口径匹配仍靠调用方；未设 `expectedScoreKind` 时，同口径就会按绝对值比（RRF 配 0.2 仍会全丢）。
- 未改默认 post-retrieval 顺序；`llm-rerank` 仍不在默认链里。
- 未收窄 export 面。

### 切片 B 实际落地

**行为**

- `RuntimeGeneratorInput.grounding?`：仅 `chunks.length === 0` 时出现。
- `chunksEmptyReason`：`no-hits`（检索 0 条）/ `filtered`（检索有条、post-retrieval 滤光）/ `skipped`（主动跳过；**本切片 runtime 不会写出**）。
- `run()` 与 `runStream()` 共用 `buildRuntimeGeneratorInput`。
- `runtime.generation.start` 在空依据时带 `output.chunksEmptyReason`。
- 内置 openai/langchain/ollama generator **不改拒答策略**；字段只让策略可表达。
- **没有**实现 `routeDecision` / `retrievalMode: "skip"`。`resolveGenerationGrounding({ retrievalSkipped: true })` 已能产出 `skipped`，供后续 skip 接线。

**主要改动文件**

- `packages/runtime/src/types/runtime-generator-input.ts`
- `packages/runtime/src/stages/generation/resolve-generation-grounding.ts`（新，已从包根导出）
- `packages/runtime/src/stages/generation/index.ts`
- `packages/runtime/src/pipeline/run-runtime.ts`
- `packages/runtime/__tests__/generation-grounding.spec.ts`（新）
- `packages/runtime/__tests__/exports.spec.ts`（断言新导出存在）

**验证**：先 `pnpm --filter @monai-ragsdk/runtime build`（新导出要对齐 dist），再 `pnpm --filter @monai-ragsdk/runtime test`（78）。

**残留风险**

- generator 仍可忽略 `grounding`，默认行为与以前一样（空 chunks 照样生成）。
- `skipped` 尚未有 runtime 生产路径；实现 skip 时必须把 `retrievalSkipped: true` 传入 resolver，否则会被标成 `no-hits`。

### 切片 D 实际落地（加法，未删字段）

**行为**

- `RuntimeRetriever` 可选 `id` / `name` / `capabilities.searchTypes` / `close()`。
- pgvector：`id` 默认 `pgvector`，`searchTypes: ['hybrid']`，已有 `close`。
- langchain：`id` 默认 `langchain`；`filterByRequest: false` 只表示 adapter 不预过滤，**runtime 仍强制过滤**。
- FanOut：默认 `name: 'fan-out'`，能力合并子 retriever；`close()` 关闭子 retriever。
- `runPreGenerationStages` 在 `retrieve` 之后调用 `enforceRetrievalRequestFilters`。真正丢候选时 metadata 带 `requestFiltersEnforced`。
- `Runtime.close()` 调用 `retriever.close?.()`。
- **没有**落地 `routeDecision` / 按 `targets` 选 retriever / 按 `searchType` 切换检索模式。有 id 之后这些才有挂钩。

**主要改动文件**

- `packages/runtime/src/stages/retrieval/runtime-retriever.ts`
- `packages/runtime/src/stages/retrieval/fan-out-retriever.ts`
- `packages/runtime/src/indexing/query-protocol.ts`（`enforceRetrievalRequestFilters`）
- `packages/runtime/src/pipeline/run-runtime.ts`
- `packages/runtime/src/types/runtime.ts`（`close()`）
- `packages/adapters/src/pgvector/retrievers/pg-vector-runtime-retriever-adapter.ts`
- `packages/adapters/src/langchain/retrievers/langchain-runtime-retriever-adapter.ts`
- `packages/runtime/__tests__/retriever-contract.spec.ts`（新）

**验证**：runtime 81；adapters 65（先 build runtime）。

**残留风险**

- 自定义 retriever 仍可不设 `id`，后续 `targets` 匹配不到。
- 能力声明尚未被消费；pgvector 仍硬编码 hybrid。
- adapter 预过滤 + runtime 再过滤是幂等的；pgvector 仍在 slice(topK) 前过滤，以免截断后不够条。

---

## 切片 C 策略（已确认）与实际落地

原则：修**条数对账**与**字段职责注释**，不落地 `routeDecision`，不收窄 barrel，不碰高危项 7 的 `toEqual`。删除死字段会连带 `apps/`、core schema、adapter metadata 与后续 routing 观测，本轮不做。

### Export 面

| 决策 | 结论 |
| --- | --- |
| `exports.spec.ts` 第 19 行 `Object.keys(src).toEqual(dist)` | **不改语义**：仍要求 src/dist 键集合一致。C 不删公开值导出。 |
| 新增 `applyRetrievalTopKAlias` | 已导出；`exports.spec.ts` 加 `toBeDefined()`。 |
| 收窄 `export *` / 把内部工具移出包根 | **不做**（切片 F）。 |
| `RetrievalRequest` 类型形状 | **不删字段**；只加 JSDoc + 别名补齐。 |

### 字段处置

| 字段 | 处置 |
| --- | --- |
| `budget.maxChunks` | 权威条数 |
| `request.topK` | `@deprecated` 别名；缺省时单向补齐 maxChunks |
| `rerank.topK` | debug/reserved，内核不读 |
| `rerank.minScore` / `rerank.strategy` | 行为字段 |
| `route` / `strategy` | debug-only |
| `indexingMode` | query-time unused |
| `metadata` | 内核不消费的透传袋 |
| `filters` / `subQueries` / `appliedStrategies` | 不动 |
| `routeDecision` | 未新增 |

**行为**

- `applyRetrievalTopKAlias`：仅当 `topK` 为正整数且 `budget.maxChunks` 缺省时写入 maxChunks；冲突时不覆盖 budget。
- `NoopQueryPreprocessor` 与 `runPreGenerationStages`（retrieve 前）都调用，自定义 preprocessor 只写 topK 也会补齐。
- audit 快照的 `topK` 优先取 `budget.maxChunks`，避免「审计 8、执行 2」。
- query-routing 的 LLM `topK` 仍直接写 `budget.maxChunks`（不写 `request.topK`）；JSON 里若同时有 `budget.maxChunks` 则覆盖。
- **没有**让 langchain 按 maxChunks 截断。

**主要改动文件**

- `packages/runtime/src/types/retrieval-request.ts`
- `packages/runtime/src/types/retrieval-budget.ts`
- `packages/runtime/src/types/retrieval-rerank-policy.ts`
- `packages/runtime/src/stages/retrieval/apply-retrieval-top-k-alias.ts`（新）
- `packages/runtime/src/stages/pre-retrieval/noop-query-preprocessor.ts`
- `packages/runtime/src/pipeline/run-runtime.ts`
- `packages/runtime/src/pipeline/assemble-runtime-result.ts`
- `packages/runtime/src/stages/pre-retrieval/strategies/query-routing-strategy.ts`（注释）
- 测试：`retrieval-topk-alias.spec.ts`（新）、`defaults.spec.ts`、`exports.spec.ts`

**验证**：先 `pnpm --filter @monai-ragsdk/runtime build`，再 `pnpm --filter @monai-ragsdk/runtime test`（88）。

**残留风险**

- langchain 仍不读 `budget.maxChunks`，换 adapter 后面条数仍可能对不上。
- `apps/` 的 `retrieval.topK` 配置若只写进 `request.topK`、未走 Noop/runtime 补齐路径，才会落到硬编码兜底；走内核 preprocess 则已补齐。
- 同时传冲突的 topK 与 maxChunks 时，`request.topK` 仍留在对象上供 debug，audit 已按 maxChunks 报。
- 未删死字段；未实现 `routeDecision`。

---

## 切片 E 实际落地

**行为**

- `createRuntimeFromConfig`：从 `query` / `postRetrieval` / `retriever` / `generator` 编译 Runtime，不再要求调用方手拼 `StrategyQueryPreprocessor` + `FanOutRetriever` + `StrategyRetrievalPostprocessor`。
- 默认包一层 FanOut（无 subQueries 时退化为单次 retrieve）。已是 `FanOutRetriever` 或 `fanOut: false` 时不套第二层。
- `assemblePostRetrievalStrategies`：官方顺序为 **rerank → threshold → … → compression → lost-in-the-middle**。`rerank` / `compression` / `lostInTheMiddle` 只有显式配置才插入。
- `postRetrieval.strategies` 完全覆盖官方顺序，装配层不重排。
- 历史 `PassthroughRetrievalPostprocessor` / `createDefaultPostprocessor` 顺序未改（仍以 threshold 开头、不含 rerank）。
- **没有**落地 `routeDecision`。`apps/` 的 `pipeline-factory` 未改（范围仍是 `packages/`）。

**主要改动文件**

- `packages/runtime/src/pipeline/create-runtime-from-config.ts`（新）
- `packages/runtime/src/stages/post-retrieval/assemble-post-retrieval-strategies.ts`（新）
- `packages/runtime/demo/strategy-pipeline.ts`（改为走装配层）
- `packages/runtime/README.md`（推荐入口）
- 测试：`create-runtime-from-config.spec.ts`（新）、`exports.spec.ts`

**验证**：先 `pnpm --filter @monai-ragsdk/runtime build`，再 test（94）。

**残留风险**

- 手拼 `StrategyRetrievalPostprocessor` 仍可把 rerank 放在 threshold 之后；官方装配层不强制改自定义数组。
- server `pipeline-factory` 仍是手拼，且 rerank 在 threshold 之后——要修产品链需另开 `apps/` 刀，改用 `createRuntimeFromConfig`。
- 未配 `postRetrieval` 时仍编译默认 passthrough 链（含空操作的 score-threshold 等），与 `createDefaultRuntime` 的 post 行为对齐，但比「完全不跑策略」更重。

---

## 切片 F 实际落地

**行为**

- 包根改为显式导出：编排（`createRuntime*`）、策略工厂、`FanOut`、类型、`createCollection`。不再 `export *` stages / indexing / `run-runtime`。
- 新入口 `@monai-ragsdk/runtime/contract`：`createIndexingRetrievalCandidate`、filters、`enforceRetrievalRequestFilters`、`fuseByReciprocalRankFusion`。
- pgvector / langchain adapter 改从 `/contract` 引用契约工具。
- `exports.spec.ts` 仍用 `toEqual` 对齐 **src/dist 键集合**，但包根断言改为「编排 API 在、内部 helper 不在」；contract 另有一套键对齐。
- **没有**拆 `run-runtime.ts`（仍属后续）；**没有**落地 `routeDecision`。

**主要改动文件**

- `packages/runtime/src/index.ts`（显式公开面）
- `packages/runtime/src/contract/index.ts`（新）
- `packages/runtime/package.json`（`exports["./contract"]`）
- `packages/adapters/.../pg-vector-runtime-retriever-adapter.ts`
- `packages/adapters/.../langchain-runtime-retriever-adapter.ts`
- demo / `tests/shared` 同步改 import
- `packages/runtime/__tests__/exports.spec.ts`

**验证**：runtime 97；adapters 65（先 build runtime）。

**残留风险**

- 包外若仍从包根 import `applyScoreThresholdStrategy` / `parseRewrittenQuery` 会编译失败；仓库内已改完。
- 内部 barrel（`stages/index.ts` 等）仍 `export *`，只是不再挂到包根。
- `FanOutRetrieverOptions.rrf` 的类型仍指向内部 `fuse-by-rrf` 的 `.d.ts`（dist 内相对路径），不经过 contract 也能编译。

---

## 切片 G 实际落地

**行为**

- `createCollection` 直接用 `VectorStore` 的可选方法，去掉 `as unknown as`。
- `isQueryStrategyPassthrough` 补比 `strategy` / `rerank` / `indexingMode` / `metadata`。
- pre/post `appliedStrategies` 只在非透传时写入；observer 仍打 `outcome: passthrough`。
- query-routing：没有可用 route 时整单透传，不写 `rewriteReason`，也不吃 JSON 里的 topK。
- 空 `effectiveQuery` 的 LLM 策略不调模型。
- **没有**拆 `run-runtime.ts`、没有统一 core/runtime 双接口、没有落地 `routeDecision`。

**主要改动文件**

- `packages/runtime/src/collection/create-collection.ts`
- `packages/runtime/src/observation/emit-runtime-observation.ts`
- `packages/runtime/src/stages/pre-retrieval/strategy-query-preprocessor.ts`
- `packages/runtime/src/stages/post-retrieval/strategy-retrieval-postprocessor.ts`
- `packages/runtime/src/stages/pre-retrieval/strategies/query-routing-strategy.ts`
- `packages/runtime/src/stages/pre-retrieval/strategies/complete-query-strategy.ts`（及 rewrite/expansion/decomposition/multi-query）
- 测试：`query-strategy-hygiene.spec.ts`（新）

**验证**：`pnpm --filter @monai-ragsdk/runtime test`（101）。

**残留风险**

- 默认 passthrough 链里经常空转的 score-threshold 等不再出现在审计 `strategies.postRetrieval`；只看审计会以为没配这些策略。observer 仍有 complete 事件。
- `run()` 与 `runStream()` 空答案语义仍不一致；`mergeSelectionTrace` 仍按 chunkId 覆盖；core/runtime 仍两套 Retriever 接口。

---

## 下一刀（复制给下一个 Agent 的任务句）

内核契约缺陷切片 A–G 已收口。[query-routing-upgrade.md](../decisions/query-routing-upgrade.md) 已落地（`routeDecision` + FanOut skip/targets + pgvector searchType）。剩余项：拆 `run-runtime.ts`、core/runtime 双接口、`mergeSelectionTrace` 历史、indexing 概念泄漏。要把 server 的 rerank/threshold 顺序修好，用 `createRuntimeFromConfig` 改 `apps/server` 的 `pipeline-factory`。内置 generator 消费 `grounding` 仍未做。
