# `@monai-ragsdk/eval` — 现状

> 快照：**2026-08-24** · 状态：**检索评测 + 回归 diff + 生成 judge 协议可用**
> 源码：`packages/eval/` · 用法：[README](../../packages/eval/README.md)
> 设计：[rag-eval-architecture.md](../decisions/rag-eval-architecture.md)
> 对接：[eval-handoff.md](../context/eval-handoff.md)
> 回：[routing.md](./routing.md)

## 1. 定位

零 workspace 依赖的纯评测算子包：golden 契约、检索观测契约、source 级 IR 指标、回归 diff、生成 judge 协议与 prompt 模板。**不**跑 pipeline、**不**读文件、**不**调 LLM。

批量跑分 harness 在 `apps/server`（`POST /api/v1/eval/run`、`/eval/compare`、`/eval/judge`、`/eval/from-traces`）；契约见 [docs/server/api.md](../server/api.md)。

## 2. 当前能力

| 分组 | 现状 |
| --- | --- |
| 契约 | `EvalSample` / `EvalDataset` / `RetrievalObservation`（retrieved + selected）；`GenerationJudgeInput` / `GenerationJudgeScore` |
| 解析 | `parseEvalDataset` / `safeParseEvalDataset`；`parseGenerationJudgeLlmOutput` |
| 指标 | `recallAtK`、`precisionAtK`、`hitRateAtK`、`mrr`、`ndcgAtK` |
| 编排 | `scoreRetrievalSample`、`aggregateRetrievalMetrics`、`buildSourceRanking` |
| 回归 | `diffRetrievalEvalReports`、`compareRetrievalSampleDiff` |
| 生成 | `buildGenerationJudgePrompt`、`scoreRefusalCorrectness`、`scoreGenerationJudgeSample`、`aggregateGenerationJudgeScores` |
| 测试 | vitest（解析、指标、unscorable、coverage、diff、judge） |

## 3. 包根导出（主路径）

| 符号 | 用途 |
| --- | --- |
| `parseEvalDataset` / `safeParseEvalDataset` | golden 校验 |
| `buildSourceRanking` | source 去重 + coverage |
| `recallAtK` … `ndcgAtK` | 单指标（通常经 `scoreRetrievalSample` 使用） |
| `scoreRetrievalSample` | 单样本检索打分 |
| `aggregateRetrievalMetrics` | 检索 macro 聚合 |
| `diffRetrievalEvalReports` | 两套结果 A/B diff |
| `DEFAULT_RETRIEVAL_K` | 默认 `[1, 3, 5, 10]` |
| `GENERATION_JUDGE_SYSTEM_PROMPT` / `buildGenerationJudgePrompt` | judge 提示词；apps 注入 LLM |
| `scoreRefusalCorrectness` | 拒答对错（纯函数，不调模型） |
| `scoreGenerationJudgeSample` | 合成忠实度 / 相关性 / 拒答 |
| `aggregateGenerationJudgeScores` | 生成 judge macro 聚合 |

类型：`EvalSample`、`EvalDataset`、`RetrievalObservation`、`RetrievalSampleScore`、`AggregatedRetrievalMetrics`、`RetrievalEvalDiffReport`、`GenerationJudgeInput`、`GenerationJudgeScore`、`AggregatedGenerationJudgeMetrics` 等，经 `src/types/` 与 schema 推断导出。

## 4. 边界

- **不要** import `@monai-ragsdk/core` / `runtime` / `observability`。
- **不要**读 `node:fs`、编译 runtime、内嵌 LLM judge。
- golden 为 **source 级**（`relevantSourceIds`）；缺 `sourceId` 不计 miss，`coverage === 0` → `unscorable`。
- 生成 judge：LLM 只打 `faithfulness` / `relevance`；`refusalCorrectness` 由 `expectedRefusal` 与观测 `refused` 比对。无检索上下文时忠实度为 `null`。三维皆 `null` → `unscorable`。
- 在线抽样 harness 在 apps（`POST /api/v1/eval/from-traces`）；本包不读 JSONL。observer 仍无 `sourceId` / 完整 answer，见决策文档内核缺口。

## 5. 与内核的关系

内核主路径 **不依赖** 本包。apps mapper 把 `RuntimeSearchResult` / `RuntimeResult` 翻译成 eval 契约后再算分：检索用 `toRetrievalObservation`，生成用 `toGenerationJudgeInput`。

就绪度：检索评测与生成 judge 协议可用。跑分落点见 [eval-handoff.md](../context/eval-handoff.md)。

## 6. 关键入口

| 路径 | 职责 |
| --- | --- |
| `src/spec/` | Zod schema |
| `src/metrics/` | 检索指标与 diff |
| `src/judge/` | 生成 judge 协议、prompt、解析与聚合 |
| `src/spec/parse-eval-dataset.ts` | golden 解析 |

## 7. 测试与脚本

```powershell
pnpm --filter @monai-ragsdk/eval build
pnpm --filter @monai-ragsdk/eval test
pnpm --filter @monai-ragsdk/eval check-types
```

## 8. 已知缺口

- 内核：`scoreKind` 不在 API 审计；observer trace 缺 `sourceId` 与完整 answer（见 [rag-eval-architecture.md](../decisions/rag-eval-architecture.md)）。在线抽样靠 apps 写入的 `AskTrace.evalSnapshot`，不假装内核已补这些字段。
