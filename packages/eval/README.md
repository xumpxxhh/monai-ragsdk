# `@monai-ragsdk/eval`

## 定位

纯评测算子包：golden 数据集契约 + source 级检索指标 + 生成 judge 协议。**不**跑 pipeline、**不**读文件、**不**调 LLM。

设计决策：[docs/decisions/rag-eval-architecture.md](../../docs/decisions/rag-eval-architecture.md) · 对接：[docs/context/eval-handoff.md](../../docs/context/eval-handoff.md)

## 依赖

无 workspace 依赖。npm 依赖仅 `zod`。

## 用法

### 解析 golden 数据集

```ts
import { parseEvalDataset } from '@monai-ragsdk/eval';

const dataset = parseEvalDataset({
  name: 'my-kb',
  version: '1.0.0',
  samples: [
    {
      id: 'q1',
      query: '什么是 RAG？',
      relevantSourceIds: ['doc-rag-intro'],
    },
  ],
});
```

### 对单样本打分

`apps/server` 在跑分前会把 `runtime.search()` 结果映射为 `RetrievalObservation`（`toRetrievalObservation`）。也可在其它 apps 自行映射：

```ts
import { scoreRetrievalSample, aggregateRetrievalMetrics } from '@monai-ragsdk/eval';

const observation = {
  retrieved: [
    { chunkId: 'c1', sourceId: 'doc-rag-intro', rank: 1, score: 0.92 },
    { chunkId: 'c2', sourceId: 'doc-other', rank: 2, score: 0.71 },
  ],
  selected: [{ chunkId: 'c1', sourceId: 'doc-rag-intro' }],
};

const score = scoreRetrievalSample(dataset.samples[0], observation, {
  layer: 'retrieved', // 或 'selected'
  k: [1, 3, 5, 10],
});

const report = aggregateRetrievalMetrics([score]);
```

### unscorable 语义

候选若全部缺少 `sourceId`，`coverage === 0`，样本标 `unscorable: true`，聚合时从分母剔除。部分缺失时仅对有 `sourceId` 的候选计 rank。

### 回归 diff

```ts
import { diffRetrievalEvalReports } from '@monai-ragsdk/eval';

const diff = diffRetrievalEvalReports({
  baselineLabel: 'balanced',
  candidateLabel: 'high-recall',
  baseline: { samples: baselineScores, aggregate: baselineAggregate },
  candidate: { samples: candidateScores, aggregate: candidateAggregate },
  primaryK: 5,
});
```

样本 `verdict`：`improved` / `regressed` / `unchanged` / `incomparable`（任一侧 unscorable）。

### 生成 judge（不调 LLM）

apps 负责 `runtime.run()` 与注入 chat 模型；本包只提供协议、prompt 与聚合：

```ts
import {
  buildGenerationJudgePrompt,
  scoreGenerationJudgeSample,
  aggregateGenerationJudgeScores,
} from '@monai-ragsdk/eval';

const input = {
  sampleId: 'q1',
  query: '退货时效是多久？',
  answer: '七天内可退货。',
  contexts: [{ sourceId: 'return-policy', text: '七日内可退。' }],
  refused: false,
  expectedRefusal: false,
};

const prompt = buildGenerationJudgePrompt(input);
const llmText = await completeJudge(prompt.system, prompt.prompt);
const score = scoreGenerationJudgeSample(input, llmText);
const report = aggregateGenerationJudgeScores([score]);
```

`refusalCorrectness` 不走模型。无检索上下文时 `faithfulness` 为 `null`。

## 边界

- 零 workspace 依赖；批量跑分见 `POST /api/v1/eval/run`，策略 A/B 见 `POST /api/v1/eval/compare`，生成 judge 见 `POST /api/v1/eval/judge`，在线抽样见 `POST /api/v1/eval/from-traces`；控制台管理员页 `/eval`
- 本包不读 JSONL、不跑 pipeline

## 脚本

```powershell
pnpm --filter @monai-ragsdk/eval build
pnpm --filter @monai-ragsdk/eval test
```
