# RAG 评测 — 对接

> 状态：**检索跑分 + 回归 diff + 生成 judge + 在线抽样 + Web 评测页已落地**
> 日期：2026-08-24
> 设计：[rag-eval-architecture.md](../decisions/rag-eval-architecture.md)
> 包现状 Wiki：[eval.md](../packages/eval.md)
> Server API：[api.md](../server/api.md)
> 范围：`packages/eval` + `apps/server` harness + `apps/web` `/eval`

下一轮 Agent 读完本文 + `rag-eval-architecture.md` 即可继续，不必重读完整实现 diff。

---

## 当前结论（必须遵守）

1. **`packages/eval` 为零 workspace 依赖叶子包**。只放 golden 契约、观测契约、指标、diff 与 judge 协议纯函数；禁止 import `core` / `runtime` / `observability`。
2. **跑 pipeline、读文件、调 LLM** 一律在 apps（harness 在 `apps/server`；控制台只调 REST）。
3. **golden 标注粒度为 source 级**（`relevantSourceIds`）。缺 `sourceId` 的候选不计 miss；`coverage === 0` → `unscorable`，聚合分母剔除。
4. **生成 judge**：LLM 只打 `faithfulness` / `relevance`；`refusalCorrectness` 由 `expectedRefusal` 与观测 `refused` 比对。无检索上下文时忠实度为 `null`。三维皆 `null` → `unscorable`。
5. **在线抽样**：检索优先 `AskTrace.evalSnapshot`；无快照才回退 observer（无 `sourceId`，多半 unscorable）。生成 judge **必须**完整 `answer`，**禁止**用 `answerPreview`。
6. **改 `packages/eval` 行为或边界** 须同轮回写 [eval.md](../packages/eval.md) 与 [routing.md](../packages/routing.md)；决策变更写 [rag-eval-architecture.md](../decisions/rag-eval-architecture.md)。
7. **内核缺口**（`scoreKind` 不在 API 审计、observer 无 `sourceId` / 完整 answer）登记在决策文档；动内核前单独开决策，不要从 eval 侧「顺便」改 runtime。

---

## 已落地能力

### packages/eval

纯函数：golden / 检索指标 / diff / 生成 judge 协议与 prompt。不读文件、不调 LLM。

### apps/server

| REST | 职责 |
| --- | --- |
| `POST /api/v1/eval/run` | retrieve-only search + 指标 |
| `POST /api/v1/eval/compare` | 两套策略 A/B + 样本级 diff |
| `POST /api/v1/eval/judge` | `runtime.run()` + LLM 忠实度 / 相关性 |
| `POST /api/v1/eval/from-traces` | 已落盘 ask 轨迹对照 golden；不重跑 pipeline |

Ask 完成时写入 `AskTrace.evalSnapshot`（完整 answer + retrieved/selected）。

### apps/web

管理员侧栏「评测」→ `/eval`（终端用户不可见）。粘贴 / 上传 `EvalDataset` JSON，选知识库，四种模式对应上述 REST。结果展示 aggregate、样本表、`sampleDiffs` verdict、`unscorableSampleIds`、judge 三维均分、未匹配 / 跳过 judge 的样本。

对比模式：baseline 用当前全局装配；candidate 套一个预设（`applyPreset`），**不**改写持久化策略。

---

## 验证命令

```powershell
pnpm --filter @monai-ragsdk/eval test
pnpm --filter @monai-ragsdk/server test
pnpm --filter @monai-ragsdk/web test
pnpm --filter @monai-ragsdk/web check-types
```

---

## 已知缺口（按优先级）

| 优先级 | 事项 | 建议落点 |
| --- | --- | --- |
| P3 | 内核：`scoreKind` 进 API 审计字段 | core + runtime；改前开决策 |
| P3 | trace 写 `sampleId` / `dataset` / `version` | observability + runtime finalizeTrace |
| P3 | observer `candidates` 补 `sourceId`；完整 answer 进 observer | runtime observation；改前开决策 |

评测分期（检索 / judge / 抽样 / Web）已完成。不要再为「评测中心」并行改内核。

---

## 下一刀

无 eval 分期剩余。若继续：内核 P3 须先开决策；不要从 Web 倒逼 observer 契约。

---

## 关键文件地图

| 路径 | 角色 |
| --- | --- |
| `packages/eval/src/` | 契约 / 指标 / judge 协议 |
| `apps/server/src/routes/eval.ts` | REST |
| `apps/web/src/features/eval/EvalPage.tsx` | 控制台评测页 |
| `docs/server/api.md` | REST 契约 |

---

## 不要做

- 在 `packages/eval` import workspace 包或读 `node:fs`
- 把评测逻辑写进 runtime / observability / adapters
- 用 `answerPreview` 冒充完整答案去做生成 judge
- 在 Wiki 里用过程语代替**当前行为**（过程写本 handoff，Wiki 写现状）
- 未改内核却在文档里假装 observer `sourceId` / 完整 answer 已可用
