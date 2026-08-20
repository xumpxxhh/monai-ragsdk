# Server API 重设计 — 前端跟进清单

> 日期：2026-08-20  
> 决策：[server-api-redesign.md](../decisions/server-api-redesign.md)  
> 范围：**仅 `apps/web`**；server 侧已按破坏性变更落地。

**状态：web 已对接完成**（2026-08-20）。

---

## 必须改的 API 调用

| 旧路径 | 新路径 | 说明 | 状态 |
| --- | --- | --- | --- |
| `POST /api/v1/collections/:id/ask` | `POST /api/v1/ask` | body 增加可选 `collectionIds` | ✅ |
| `POST /api/v1/collections/:id/search` | `POST /api/v1/search` | 同上 | ✅ |
| `GET /api/v1/collections/:id/strategy` | `GET /api/v1/strategy` | 全局唯一策略 | ✅ |
| `PUT /api/v1/collections/:id/strategy` | `PUT /api/v1/strategy` | `collectionId` 固定为 `'global'` | ✅ |

### 新请求体

```typescript
// POST /api/v1/ask
{ question: string; collectionIds?: string[] }

// POST /api/v1/search
{ query: string; topK?: number; collectionIds?: string[] }
```

- 不传 `collectionIds`：检索**全部**已注册知识库（FanOut + RRF）
- 传 `[id]`：等价于旧单库 path
- SSE 事件格式不变（`token` / `meta` / `result` / `error` / `done` + `[DONE]`）

### 新增 ingest 能力

| 路径 | 说明 | 状态 |
| --- | --- | --- |
| `POST /api/v1/collections/:id/ingest/recommend` | 根据文档 metadata 返回推荐 `chunking` / `loaderHint` | ✅ |
| `POST .../ingest` body 增加 `chunking?` | `strategy: fixed \| heading \| parent-child` + 可选 size/overlap | ✅ |

---

## 页面 / 交互调整

| 区域 | 建议 | 落地 |
| --- | --- | --- |
| 问答入口 | 无需选库，直接进入全局问答 | ✅ 已移除顶栏知识库筛选 |
| API client | `ask({ question, collectionIds? })` | ✅ `shared/api/documents.ts` |
| 策略页 | 读写 `/api/v1/strategy`；独立路由 `/strategy` | ✅ `StrategyPage` |
| 列表 presetLabel | 展示全局 preset，去掉 per-collection 预设 | ✅ `KnowledgeBasesPage` |
| Ask 轨迹 | `collectionId === 'global'` 时展示「N 个知识库」 | ✅ `ObservePage` |
| 入库 UI | 调 `ingest/recommend` 后再提交 | ✅ `IngestConfigModal` |

旧路由 `/knowledge-bases/:id/strategy` 重定向至 `/strategy`。

---

## 类型同步

web `shared/types` 已对齐 server `types/api.ts`：

- `ChunkingStrategy` / `ChunkingConfig` / `IngestRecommendation`
- `GlobalAskRequest` / `GlobalSearchRequest`
- `IngestDocumentInput.metadata.mimeType`

---

## 验收清单

- [x] 不选知识库可直接提问并得到 SSE 流
- [x] 选择单个知识库时 body 传 `collectionIds: [id]`
- [x] 策略页保存后全局 ask/search 行为变化
- [x] 旧 path 不再被调用（Network 面板无 `/collections/*/ask`）
- [x] 入库前展示 recommend 返回的 chunking 建议

---

## 参考

- 完整接口说明：[api.md](./api.md)
- OpenAPI 级细节见 server 路由：`routes/ask.ts`、`routes/search.ts`、`routes/strategy.ts`
