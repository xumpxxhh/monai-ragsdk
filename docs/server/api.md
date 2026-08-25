# `@monai-ragsdk/server` 已实现接口

面向 `apps/web` 控制台的 REST / SSE 契约说明。实现位于 [`apps/server`](../../apps/server)，与前端 [`apps/web/src/shared/api`](../../apps/web/src/shared/api) 对齐。

## 约定

| 项       | 说明                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 默认基址 | `http://localhost:3000`                                                                                                                                    |
| 业务前缀 | `/api/v1`                                                                                                                                                  |
| 健康检查 | `/health`（不在 `/api/v1` 下）                                                                                                                             |
| 请求体   | JSON，`Content-Type: application/json`（上限约 10MB）                                                                                                      |
| 时间字段 | ISO 8601 字符串                                                                                                                                            |
| 错误体   | `{ "message": string, "code"?: string }`                                                                                                                   |
| 环境变量 | 见 [`apps/server/README.md`](../../apps/server/README.md)；Turbo Strict 下密钥须走 `globalPassThroughEnv` / 包内 `passThroughEnv`，或写 `apps/server/.env` |

常见 HTTP 状态：`200` / `201` / `202` / `204`；业务错误 `400` / `404`；未捕获异常 `500`（`code: internal_error`）。

---

## 一览

| 方法   | 路径                                                  | 说明                                      |
| ------ | ----------------------------------------------------- | ----------------------------------------- |
| GET    | `/health`                                             | 进程存活                                  |
| GET    | `/api/v1/collections`                                 | 知识库列表（可选分页 / 搜索）             |
| POST   | `/api/v1/collections`                                 | 创建知识库                                |
| GET    | `/api/v1/collections/:id`                             | 知识库详情                                |
| PUT    | `/api/v1/collections/:id`                             | 更新名称 / 描述                           |
| DELETE | `/api/v1/collections/:id`                             | 删除知识库（含向量表）                    |
| GET    | `/api/v1/collections/:id/documents`                   | 文档源列表                                |
| GET    | `/api/v1/collections/:id/documents/:documentId`       | 单文档详情（含原文 content）              |
| POST   | `/api/v1/collections/:id/ingest/recommend`            | 入库配置推荐（chunking / loaderHint）     |
| POST   | `/api/v1/collections/:id/ingest`                      | 启动入库（异步任务；可选 `chunking`）     |
| GET    | `/api/v1/collections/:id/ingest/:taskId`              | 轮询入库进度                              |
| GET    | `/api/v1/collections/:id/ingest/latest`               | 最近一次入库摘要                          |
| POST   | `/api/v1/collections/:id/documents/:documentId/retry` | 按登记原文重试入库                        |
| DELETE | `/api/v1/collections/:id/documents/:documentId`       | 删除文档源                                |
| POST   | `/api/v1/eval/run`                                    | 检索评测：golden 数据集批量 search + 指标聚合 |
| POST   | `/api/v1/eval/compare`                                | 回归对比：两套策略 A/B 跑分 + 样本级 diff     |
| POST   | `/api/v1/eval/judge`                                  | 生成评测：逐条 `runtime.run` + LLM 忠实度 / 相关性 / 拒答 |
| POST   | `/api/v1/eval/from-traces`                            | 在线抽样：已落盘 ask 轨迹对照 golden 打分（不重跑 pipeline） |
| POST   | `/api/v1/search`                                      | 全局检索（可选 `collectionIds`）          |
| POST   | `/api/v1/ask`                                         | 全局流式问答（SSE；可选 `collectionIds`） |
| GET    | `/api/v1/strategy`                                    | 读取全局策略                              |
| PUT    | `/api/v1/strategy`                                    | 保存全局策略                              |
| GET    | `/api/v1/collections/:id/dashboard`                   | 工作台统计                                |
| GET    | `/api/v1/activities`                                  | 最近活动                                  |
| GET    | `/api/v1/traces/ask`                                  | 问答轨迹列表                              |
| GET    | `/api/v1/traces/ask/:id`                              | 单条问答轨迹                              |
| GET    | `/api/v1/traces/ingest`                               | 入库轨迹列表                              |
| GET    | `/api/v1/connection`                                  | Embedding / Chat / 向量库配置状态         |

---

## 健康检查

### `GET /health`

**响应 `200`**

```json
{ "ok": true }
```

---

## 知识库

### `GET /api/v1/collections`

| Query      | 类型   | 说明                                 |
| ---------- | ------ | ------------------------------------ |
| `q`        | string | 按名称模糊过滤（可选）               |
| `page`     | number | 有 `page` 时返回分页体；无则返回数组 |
| `pageSize` | number | 默认 `12`                            |

**响应 `200`（无 `page`）**：`CollectionSummary[]`

**响应 `200`（有 `page`）**：`Paginated<CollectionSummary>`

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 12
}
```

### `POST /api/v1/collections`

**请求体**

```json
{
  "name": "产品手册库",
  "description": "可选",
  "ingestMode": "incremental"
}
```

| 字段          | 说明                                        |
| ------------- | ------------------------------------------- |
| `name`        | 必填（空串会 400）                          |
| `description` | 可选                                        |
| `ingestMode`  | `incremental` \| `full`，缺省 `incremental` |

**响应 `201`**：`CollectionDetail`

### `GET /api/v1/collections/:id`

**响应 `200`**：`CollectionDetail`  
**404**：知识库不存在

### `PUT /api/v1/collections/:id`

**请求体**（均可选）

```json
{
  "name": "新名称",
  "description": "新描述"
}
```

**响应 `200`**：`CollectionDetail`

### `DELETE /api/v1/collections/:id`

关闭连接池、删除元数据，并 `DROP` 对应 pgvector 表。

**响应 `204`**

---

## 文档与入库

路径均挂在 `/api/v1/collections/:id` 下。

### `GET .../documents`

| Query      | 类型   | 说明                                                    |
| ---------- | ------ | ------------------------------------------------------- |
| `q`        | string | 匹配 `title` / `sourceId`                               |
| `status`   | string | `all` 或 `indexed` / `failed` / `unchanged` / `pending` |
| `page`     | number | 默认 `1`                                                |
| `pageSize` | number | 默认 `10`                                               |

**响应 `200`**：`Paginated<DocumentSource>`（不含原文 `content`）

### `GET .../documents/:documentId`

返回单文档详情，含入库时登记的原始文本（`content`）。列表接口故意不带正文，避免整表膨胀。

**响应 `200`**：`DocumentDetail`

**404**：文档不存在

### `POST .../ingest/recommend`

根据文档 metadata（标题扩展名 / `mimeType`）返回推荐入库配置。只读，不执行 ingest。

**请求体**

```json
{
  "documents": [{ "metadata": { "title": "手册.md", "mimeType": "text/markdown" } }]
}
```

**响应 `200`**：`IngestRecommendation`

```json
{
  "chunking": { "strategy": "heading" },
  "loaderHint": "text/markdown",
  "mode": "incremental"
}
```

### `POST .../ingest`

异步入库：立即返回 `taskId`，后台跑 indexing。同一知识库同时只能有一个入库任务。

**请求体**

```json
{
  "documents": [
    {
      "id": "可选",
      "content": "文档正文",
      "metadata": {
        "title": "退货政策.md",
        "sourceId": "退货政策.md"
      }
    }
  ],
  "mode": "incremental",
  "chunking": {
    "strategy": "fixed",
    "chunkSize": 500,
    "overlap": 50
  }
}
```

| 字段                             | 说明                                                |
| -------------------------------- | --------------------------------------------------- |
| `documents`                      | 文本文档数组；空内容会被过滤，全空则任务失败        |
| `mode`                           | 可选，覆盖库默认 `ingestMode`                       |
| `chunking.strategy`              | 可选：`fixed`（默认）\| `heading` \| `parent-child` |
| `chunking.chunkSize` / `overlap` | 仅 `strategy=fixed` 时有效；默认 500 / 50           |

**响应 `202`**

```json
{ "taskId": "uuid" }
```

**400**：该库正在入库

### `GET .../ingest/:taskId`

供前端轮询（建议间隔约 500ms，直到 `done: true`）。

**响应 `200`**：`IngestProgressEvent`

```json
{
  "current": 1,
  "total": 3,
  "fileName": "退货政策.md",
  "stats": {
    "added": 0,
    "skipped": 0,
    "replaced": 0,
    "failed": 0,
    "cleaned": 0
  },
  "log": "可选错误或提示",
  "done": false
}
```

说明：SDK ingest 不是逐文件流；进度主要为「进行中 → 完成/失败」两态。

### `GET .../ingest/latest`

**响应 `200`**：`LastIngestSummary | null`

### `POST .../documents/:documentId/retry`

用登记表中保存的原文再次 ingest。

**响应 `204`**

### `DELETE .../documents/:documentId`

按 `sourceId` 调 `deleteByFilters`，并移除登记记录。

**响应 `204`**

---

## 检索与问答（全局）

> **破坏性变更（2026-08-20）**：已删除 `POST .../collections/:id/ask|search|strategy`。  
> 前端迁移见 [web-followup.md](./web-followup.md)。

### `POST /api/v1/search`

**请求体**

```json
{
  "query": "退货时效是多久？",
  "topK": 10,
  "collectionIds": ["kb-uuid-optional"]
}
```

| 字段            | 说明                                  |
| --------------- | ------------------------------------- |
| `query`         | 必填                                  |
| `topK`          | 可选；缺省用全局策略 `retrieval.topK` |
| `collectionIds` | 可选；不传则检索全部已注册知识库      |

**响应 `200`**：`SearchResult`

| 字段             | 说明                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `hits`           | 检索命中列表                                                         |
| `appliedFilters` | 实际生效的 post-retrieval 策略名（来自 runtime `strategies.postRetrieval`） |
| `traceId`        | 本次 search 的 trace / request id                                    |
| `pipeline`       | 四段 runtime 摘要（不含 generation 段）                              |
| `executionTrace` | 可选；observer 全链路（events/errors），与 memoryExporter 同源       |

### `POST /api/v1/eval/run`

对 inline golden 数据集逐条跑 retrieve-only `search`，返回 source 级检索指标。契约见 [`packages/eval`](../../packages/eval/README.md)。

**请求体**

```json
{
  "dataset": {
    "name": "demo-kb",
    "version": "1.0.0",
    "samples": [
      {
        "id": "q1",
        "query": "退货时效是多久？",
        "relevantSourceIds": ["return-policy"]
      }
    ]
  },
  "collectionIds": ["kb-uuid-optional"],
  "topK": 10,
  "layer": "retrieved",
  "k": [1, 3, 5, 10]
}
```

| 字段            | 说明                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `dataset`       | 必填；`EvalDataset` JSON，由 `@monai-ragsdk/eval` 校验               |
| `collectionIds` | 可选；与 search 相同 scope                                           |
| `topK`          | 可选；缺省用全局策略 `retrieval.topK`                                |
| `layer`         | 可选；`retrieved`（默认）或 `selected`                               |
| `k`             | 可选；@k 切点，默认 `[1, 3, 5, 10]`                                  |

**响应 `200`**：`EvalRunReport`

| 字段        | 说明                                           |
| ----------- | ---------------------------------------------- |
| `samples`   | 每样本 `query`、coverage、unscorable、mrr、@k  |
| `aggregate` | macro 平均；`unscorableSampleIds` 单列不可评分 |

**400**：dataset 校验失败（Zod 错误消息）

### `POST /api/v1/eval/compare`

同一 golden 数据集在 **baseline** 与 **candidate** 两套策略下各跑一遍 retrieve-only `search`，返回两侧完整报告与样本级 diff。

**请求体**

```json
{
  "dataset": {
    "name": "demo-kb",
    "version": "1.0.0",
    "samples": [
      {
        "id": "q1",
        "query": "退货时效是多久？",
        "relevantSourceIds": ["return-policy"]
      }
    ]
  },
  "baseline": {
    "label": "balanced",
    "strategy": { "...": "完整 StrategyConfig；省略则用当前全局策略" }
  },
  "candidate": {
    "label": "high-recall-no-rerank",
    "strategy": { "...": "完整 StrategyConfig" }
  },
  "collectionIds": ["kb-uuid-optional"],
  "topK": 10,
  "layer": "retrieved",
  "k": [1, 3, 5, 10],
  "primaryK": 5
}
```

| 字段                       | 说明                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `baseline` / `candidate`   | 必填；`label` 用于报告；`strategy` 可选，省略时读当前 `GET /strategy` |
| `primaryK`                 | 可选；MRR 持平时用 `recall@primaryK` 判定 improved/regressed         |

**响应 `200`**：`EvalCompareReport`

| 字段       | 说明                                                                 |
| ---------- | -------------------------------------------------------------------- |
| `baseline` | 与 `/eval/run` 同构，含 `label`                                      |
| `candidate`| 同上                                                                 |
| `diff`     | `aggregateDelta`（meanMrrDelta、meanAtKDelta）；`sampleDiffs[].verdict` 为 `improved` / `regressed` / `unchanged` / `incomparable`；`improvedSampleIds` 等汇总 |

**400**：dataset 校验失败、arm label 为空

### `POST /api/v1/eval/judge`

对 inline golden 数据集逐条跑完整 `runtime.run()`，再注入 LLM 评审生成质量。契约见 [`packages/eval`](../../packages/eval/README.md)。

拒答对错由标注 `expectedRefusal` 与 `generationMetadata.groundingRefusal` 纯函数比对，**不**交给 LLM。忠实度 / 相关性由 chat 模型按 eval 包 prompt 模板打 0–1 分。

**请求体**

```json
{
  "dataset": {
    "name": "demo-kb",
    "version": "1.0.0",
    "samples": [
      {
        "id": "q1",
        "query": "退货时效是多久？",
        "relevantSourceIds": ["return-policy"],
        "expectedRefusal": false,
        "referenceAnswer": "七日内可退。"
      }
    ]
  },
  "collectionIds": ["kb-uuid-optional"],
  "strategy": { "...": "完整 StrategyConfig；省略则用当前全局策略" }
}
```

| 字段            | 说明                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `dataset`       | 必填；`EvalDataset` JSON。`expectedRefusal` / `referenceAnswer` 可选 |
| `collectionIds` | 可选；与 ask 相同 scope                                              |
| `strategy`      | 可选；省略时读当前 `GET /strategy`，**不**改写持久化策略             |

**响应 `200`**：`EvalJudgeReport`

| 字段        | 说明                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `samples`   | 每样本 `answer`、`refused`、`faithfulness` / `relevance` / `refusalCorrectness`（缺维为 `null`） |
| `aggregate` | 各维 macro 平均，分母只计非 null；`unscorableSampleIds` 三维皆空的样本 |

无检索上下文时 `faithfulness` 为 `null`（没有可对照依据）。LLM 输出无法解析时忠实度/相关性为 `null`，拒答维仍可计分。单样本 judge 调用失败不中断整批。

**400**：dataset 校验失败

### `POST /api/v1/eval/from-traces`

用已落盘的 ask 轨迹对照 golden 打分，**不**再跑 `search` / `run`。轨迹来自内存中的 `AskTrace`（启动时读 `data/ask-traces.jsonl`，最多 100 条）。

对齐规则：`sample.query` 精确匹配 `question`，否则匹配 `effectiveQuestion`；每条轨迹最多用一次，优先较新的。

检索优先读 `AskTrace.evalSnapshot`（含 `sourceId`）。没有快照时回退 observer 事件，但 **candidates 无 sourceId**，样本通常 `unscorable`。生成 judge **必须**有完整 `answer`；`answerPreview`（200 字）不用。

**请求体**

```json
{
  "dataset": {
    "name": "demo-kb",
    "version": "1.0.0",
    "samples": [
      {
        "id": "q1",
        "query": "退货时效是多久？",
        "relevantSourceIds": ["return-policy"],
        "expectedRefusal": false
      }
    ]
  },
  "traceIds": ["optional-ask-trace-id"],
  "collectionId": "kb-uuid-optional",
  "layer": "retrieved",
  "k": [1, 3, 5, 10],
  "includeJudge": true
}
```

| 字段            | 说明                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `dataset`       | 必填；`EvalDataset` JSON                                             |
| `traceIds`      | 可选；指定轨迹。省略则用当前 ask traces（`success` 的）              |
| `collectionId`  | 可选；过滤轨迹知识库；与 `traceIds` 同时出现时仍先按 id 取           |
| `layer` / `k`   | 与 `/eval/run` 相同                                                  |
| `includeJudge`  | 可选；默认 `true`。无 `evalSnapshot.answer` 的旧轨迹仍跳过 judge     |

**响应 `200`**：`EvalFromTracesReport`

| 字段                    | 说明                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `matchedSampleCount`    | 对上轨迹的样本数                                             |
| `unmatchedSampleIds`    | 没有对应轨迹的 golden id                                     |
| `skippedJudgeSampleIds` | 对上轨迹但缺少完整 answer、因而没跑 judge 的样本             |
| `retrieval`             | `samples`（含 `traceId`）+ `aggregate`                       |
| `judge`                 | 可选；至少一条可 judge 时出现                                |

**400**：dataset 校验失败。**404**：`traceIds` 中有不存在的 id。

新产生的 ask 会在 `AskTrace.evalSnapshot` 写入完整 `answer`、retrieved/selected（含 sourceId 与入 prompt 正文）。observer 协议本身仍只有 `answerPreview`、candidates 无 sourceId。

### `POST /api/v1/ask`（SSE）

流式问答。请求头建议：`Accept: text/event-stream`。

**请求体**

```json
{
  "question": "退货时效是多久？",
  "collectionIds": ["kb-uuid-optional"]
}
```

| 字段            | 说明                           |
| --------------- | ------------------------------ |
| `question`      | 必填                           |
| `collectionIds` | 可选；不传则跨全部已注册知识库 |

**响应**：`text/event-stream`，每行形如 `data: <json>\n\n`。

| 事件 `type`        | 字段                                              | 说明                                                       |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `token`             | `content`                                         | 增量 delta（前端自行累加）                                 |
| `meta`              | `traceId`；可选 `effectiveQuery`                  | 流开始即带 `traceId`；改写后与 `effectiveQuery` 同条下发   |
| `observer`          | `event`（`RAGEvent`）                             | 本轮 runtime observer 事件；管理员检查面实时时间线         |
| `observer-error`    | `error`（`RAGErrorRecord`）                       | 本轮 observer 错误记录                                     |
| `result`            | `citations`、`noGrounding`、`pipeline`、`traceId` | 引用列表；无召回且策略为 `explicit` 时 `noGrounding: true` |
| `execution-trace`   | `executionTrace`（`RAGTrace`）                    | 流结束后整条 observer 快照，防止 live 推送漏事件           |
| `error`             | `message`                                         | 执行失败                                                   |
| `done`              | —                                                 | 正常结束标记                                               |
| —                   | `data: [DONE]`                                    | 流结束哨兵（与 web `apiPostSse` 兼容）                     |

`citations` 元素形如：

```json
{
  "index": 1,
  "sourceId": "退货政策.md",
  "title": "退货政策.md",
  "snippet": "…",
  "score": 0.92
}
```

客户端断开连接时服务端停止写入。

`pipeline` 为精简 DTO `PipelineSnapshot`（从 `RuntimeResult` 映射），四段结构见下文；不把整份 `RAGResponse` 暴露给浏览器。

---

## 策略（全局）

### `GET /api/v1/strategy`

**响应 `200`**：`StrategyConfig`（`collectionId` 为 `'global'`）

### `PUT /api/v1/strategy`

**请求体**：完整 `StrategyConfig`；服务端强制 `collectionId: 'global'`。

保存后影响后续全部 `/api/v1/ask` 与 `/api/v1/search`。`generation.activeRag` 可写入但不生效（路线图冻结）。

**响应 `200`**：更新后的 `StrategyConfig`

---

## 观测与连接

### `GET /api/v1/collections/:id/dashboard`

**响应 `200`**：`DashboardStats`

```json
{
  "documentCount": 12,
  "lastIngestSuccess": true,
  "lastIngestAt": "2026-08-19T04:00:00.000Z",
  "askCount7d": 3,
  "avgCitations": 2.5,
  "failedIngestCount": 0
}
```

### `GET /api/v1/activities`

| Query          | 说明                                                     |
| -------------- | -------------------------------------------------------- |
| `collectionId` | 可选；过滤某一库（无 `collectionId` 的全局活动仍会返回） |

**响应 `200`**：`ActivityItem[]`（进程内环形缓冲，约最近 100 条）

### `GET /api/v1/traces/ask`

| Query          | 说明                     |
| -------------- | ------------------------ |
| `collectionId` | 可选                     |
| `q`            | 可选，按问题文本模糊过滤 |

**响应 `200`**：`AskTrace[]`

### `GET /api/v1/traces/ask/:id`

**响应 `200`**：`AskTrace`  
**404**：轨迹不存在

`AskTrace` 在问答完成时写入，含可选 `pipeline`（与 SSE `result.pipeline` 同构）、`traceId`，以及供评测用的 `evalSnapshot`（完整 answer + retrieved/selected）。observer 的 `executionTrace` 仍只有 `answerPreview`。

### `GET /api/v1/traces/ingest`

| Query          | 说明 |
| -------------- | ---- |
| `collectionId` | 可选 |

**响应 `200`**：`IngestTaskTrace[]`

### `GET /api/v1/connection`

根据环境变量是否已配置返回状态（不实际 ping 远端）。

**响应 `200`**：`ConnectionInfo`

```json
{
  "embedding": "connected",
  "chat": "connected",
  "vectorStore": "connected"
}
```

取值：`connected` | `unconfigured`。

---

## 主要响应类型（摘要）

与 [`apps/server/src/types/api.ts`](../../apps/server/src/types/api.ts) / web `shared/types` 同构。

### `CollectionSummary` / `CollectionDetail`

| 字段                   | 类型                              | 说明               |
| ---------------------- | --------------------------------- | ------------------ |
| `id`                   | string                            | 如 `kb-<uuid>`     |
| `name` / `description` | string                            |                    |
| `documentCount`        | number                            | 非 `failed` 文档数 |
| `health`               | `healthy` \| `warning` \| `empty` |                    |
| `presetLabel`          | string                            | 策略预设中文标签   |
| `failedIngestCount`    | number                            |                    |
| `lastIngestAt`         | string \| null                    |                    |
| `createdAt`            | string                            | 仅 Detail          |

### `DocumentSource`

| 字段                                         | 类型                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `id` / `collectionId` / `sourceId` / `title` | string                                            |
| `status`                                     | `indexed` \| `failed` \| `unchanged` \| `pending` |
| `updatedAt`                                  | string                                            |
| `failReason`                                 | string?                                           |

### `DocumentDetail`

在 `DocumentSource` 基础上增加：

| 字段      | 类型   | 说明                         |
| --------- | ------ | ---------------------------- |
| `content` | string | 入库登记的原始文本（可为空） |

### `StrategyConfig`

含 `preset`、`preRetrieval`（rewrite / expansion / decomposition / multiQuery / routing）、`retrieval.topK`、`postRetrieval`（阈值 / 去重 / budget / coverage / rerank / compression / lostInMiddle）、`generation`（citations / activeRag / noGroundingPolicy）。

### `PipelineSnapshot`

一次 runtime ask / search 的四段摘要；`search` 不含 `generation`，`ask` 含。

| 段 | 字段（有则返回） |
| --- | --- |
| 顶层 | `traceId`；可选 `timings`（preRetrieval / retrieval / postRetrieval / generation / total，毫秒） |
| `preRetrieval` | `originalQuery`、`effectiveQuery`；可选 `subQueries`、`strategies`、`rewriteReason` |
| `retrieval` | 可选 `retrieved`、`skipped`、`skipReason`、`retrieverCount`、`fusedCandidateCount`、`strategies` |
| `postRetrieval` | 可选 `selected`、`dropped`、`finalChunks`、`strategies`（按官方装配顺序理解） |
| `generation` | `citationCount`；可选 `groundingRefusal`、`chunksEmptyReason`、`noGroundingPolicy`、`strategies` |

`AskTrace.pipeline` 与 ask SSE `result.pipeline` 同构；`routeDecision` 不在快照内（内核尚未写入 RAGResponse 具名字段）。

---

## 实现边界（当前版本）

- 无认证 / 多租户；角色视图仍由前端 localStorage 控制。
- 入库只接受 JSON 文本正文，不做 PDF 解析或目录同步；可通过 `ingest/recommend` 获取 chunking 建议。
- ask/search 为全局路由；跨库检索默认 FanOut 全部已注册知识库。
- 活动与 ask/ingest 轨迹为**进程内缓冲**，重启丢失；知识库元数据落 `apps/server/data/state.json`，向量在 pgvector。
- 不另开知识库 package，不扩展完整文档生命周期。
