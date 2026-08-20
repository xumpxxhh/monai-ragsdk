# `@monai-ragsdk/server` 已实现接口

面向 `apps/web` 控制台的 REST / SSE 契约说明。实现位于 [`apps/server`](../../apps/server)，与前端 [`apps/web/src/shared/api`](../../apps/web/src/shared/api) 对齐。

## 约定

| 项 | 说明 |
| --- | --- |
| 默认基址 | `http://localhost:3000` |
| 业务前缀 | `/api/v1` |
| 健康检查 | `/health`（不在 `/api/v1` 下） |
| 请求体 | JSON，`Content-Type: application/json`（上限约 10MB） |
| 时间字段 | ISO 8601 字符串 |
| 错误体 | `{ "message": string, "code"?: string }` |
| 环境变量 | 见 [`apps/server/README.md`](../../apps/server/README.md)；Turbo Strict 下密钥须走 `globalPassThroughEnv` / 包内 `passThroughEnv`，或写 `apps/server/.env` |

常见 HTTP 状态：`200` / `201` / `202` / `204`；业务错误 `400` / `404`；未捕获异常 `500`（`code: internal_error`）。

---

## 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 进程存活 |
| GET | `/api/v1/collections` | 知识库列表（可选分页 / 搜索） |
| POST | `/api/v1/collections` | 创建知识库 |
| GET | `/api/v1/collections/:id` | 知识库详情 |
| PUT | `/api/v1/collections/:id` | 更新名称 / 描述 |
| DELETE | `/api/v1/collections/:id` | 删除知识库（含向量表） |
| GET | `/api/v1/collections/:id/documents` | 文档源列表 |
| POST | `/api/v1/collections/:id/ingest/recommend` | 入库配置推荐（chunking / loaderHint） |
| POST | `/api/v1/collections/:id/ingest` | 启动入库（异步任务；可选 `chunking`） |
| GET | `/api/v1/collections/:id/ingest/:taskId` | 轮询入库进度 |
| GET | `/api/v1/collections/:id/ingest/latest` | 最近一次入库摘要 |
| POST | `/api/v1/collections/:id/documents/:documentId/retry` | 按登记原文重试入库 |
| DELETE | `/api/v1/collections/:id/documents/:documentId` | 删除文档源 |
| POST | `/api/v1/search` | 全局检索（可选 `collectionIds`） |
| POST | `/api/v1/ask` | 全局流式问答（SSE；可选 `collectionIds`） |
| GET | `/api/v1/strategy` | 读取全局策略 |
| PUT | `/api/v1/strategy` | 保存全局策略 |
| GET | `/api/v1/collections/:id/dashboard` | 工作台统计 |
| GET | `/api/v1/activities` | 最近活动 |
| GET | `/api/v1/traces/ask` | 问答轨迹列表 |
| GET | `/api/v1/traces/ask/:id` | 单条问答轨迹 |
| GET | `/api/v1/traces/ingest` | 入库轨迹列表 |
| GET | `/api/v1/connection` | Embedding / Chat / 向量库配置状态 |

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

| Query | 类型 | 说明 |
| --- | --- | --- |
| `q` | string | 按名称模糊过滤（可选） |
| `page` | number | 有 `page` 时返回分页体；无则返回数组 |
| `pageSize` | number | 默认 `12` |

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

| 字段 | 说明 |
| --- | --- |
| `name` | 必填（空串会 400） |
| `description` | 可选 |
| `ingestMode` | `incremental` \| `full`，缺省 `incremental` |

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

| Query | 类型 | 说明 |
| --- | --- | --- |
| `q` | string | 匹配 `title` / `sourceId` |
| `status` | string | `all` 或 `indexed` / `failed` / `unchanged` / `pending` |
| `page` | number | 默认 `1` |
| `pageSize` | number | 默认 `10` |

**响应 `200`**：`Paginated<DocumentSource>`（不含原文 `content`）

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

| 字段 | 说明 |
| --- | --- |
| `documents` | 文本文档数组；空内容会被过滤，全空则任务失败 |
| `mode` | 可选，覆盖库默认 `ingestMode` |
| `chunking.strategy` | 可选：`fixed`（默认）\| `heading` \| `parent-child` |
| `chunking.chunkSize` / `overlap` | 仅 `strategy=fixed` 时有效；默认 500 / 50 |

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

| 字段 | 说明 |
| --- | --- |
| `query` | 必填 |
| `topK` | 可选；缺省用全局策略 `retrieval.topK` |
| `collectionIds` | 可选；不传则检索全部已注册知识库 |

**响应 `200`**：`SearchResult`（与旧单库 search 同构）

### `POST /api/v1/ask`（SSE）

流式问答。请求头建议：`Accept: text/event-stream`。

**请求体**

```json
{
  "question": "退货时效是多久？",
  "collectionIds": ["kb-uuid-optional"]
}
```

| 字段 | 说明 |
| --- | --- |
| `question` | 必填 |
| `collectionIds` | 可选；不传则跨全部已注册知识库 |

**响应**：`text/event-stream`，每行形如 `data: <json>\n\n`。

| 事件 `type` | 字段 | 说明 |
| --- | --- | --- |
| `token` | `content` | 增量 delta（前端自行累加） |
| `meta` | `effectiveQuery` | 有效查询（若与原问题不同） |
| `result` | `citations`、`noGrounding` | 引用列表；无召回且策略为 `explicit` 时 `noGrounding: true` |
| `error` | `message` | 执行失败 |
| `done` | — | 正常结束标记 |
| — | `data: [DONE]` | 流结束哨兵（与 web `apiPostSse` 兼容） |

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

| Query | 说明 |
| --- | --- |
| `collectionId` | 可选；过滤某一库（无 `collectionId` 的全局活动仍会返回） |

**响应 `200`**：`ActivityItem[]`（进程内环形缓冲，约最近 100 条）

### `GET /api/v1/traces/ask`

| Query | 说明 |
| --- | --- |
| `collectionId` | 可选 |
| `q` | 可选，按问题文本模糊过滤 |

**响应 `200`**：`AskTrace[]`

### `GET /api/v1/traces/ask/:id`

**响应 `200`**：`AskTrace`  
**404**：轨迹不存在

### `GET /api/v1/traces/ingest`

| Query | 说明 |
| --- | --- |
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

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 如 `kb-<uuid>` |
| `name` / `description` | string | |
| `documentCount` | number | 非 `failed` 文档数 |
| `health` | `healthy` \| `warning` \| `empty` | |
| `presetLabel` | string | 策略预设中文标签 |
| `failedIngestCount` | number | |
| `lastIngestAt` | string \| null | |
| `createdAt` | string | 仅 Detail |

### `DocumentSource`

| 字段 | 类型 |
| --- | --- |
| `id` / `collectionId` / `sourceId` / `title` | string |
| `status` | `indexed` \| `failed` \| `unchanged` \| `pending` |
| `updatedAt` | string |
| `failReason` | string? |

### `StrategyConfig`

含 `preset`、`preRetrieval`（rewrite / expansion / decomposition / multiQuery / routing）、`retrieval.topK`、`postRetrieval`（阈值 / 去重 / budget / coverage / rerank / compression / lostInMiddle）、`generation`（citations / activeRag / noGroundingPolicy）。

---

## 实现边界（当前版本）

- 无认证 / 多租户；角色视图仍由前端 localStorage 控制。
- 入库只接受 JSON 文本正文，不做 PDF 解析或目录同步；可通过 `ingest/recommend` 获取 chunking 建议。
- ask/search 为全局路由；跨库检索默认 FanOut 全部已注册知识库。
- 活动与 ask/ingest 轨迹为**进程内缓冲**，重启丢失；知识库元数据落 `apps/server/data/state.json`，向量在 pgvector。
- 不另开知识库 package，不扩展完整文档生命周期。
