# Agent Knowledge 服务

面向 Agent 的 **search-only** knowledge tool。只读复用控制台（`apps/server`）已入库的知识库与全局检索策略，不暴露 ask / ingest / 评测 / 观测。

## 启动

```bash
pnpm install
copy apps\knowledge\.env.example apps\knowledge\.env
# 填入 EMBEDDING_API_KEY；策略 LLM 开关开启时还需 DOTSAI_API_KEY

# 先确保控制台已入库（apps/server + web）
pnpm dev:server

pnpm dev:knowledge
```

默认监听 `http://localhost:3001`（与控制台 3000 错开）。

## 与控制台的关系

| 项 | 控制台 `apps/server` | 本服务 `apps/knowledge` |
| --- | --- | --- |
| 建库 / 入库 | 负责 | 不做 |
| 全局策略 | `PUT /api/v1/strategy` | 只读 `state.json` 里的 `globalStrategy` |
| 向量数据 | pgvector 分表 | 同一连接串、同一表名规则 |
| 登记元数据 | `apps/server/data/state.json` | 只读，路径可用 `CONSOLE_STATE_PATH` 覆盖 |

控制台新建知识库或改策略后，本服务**下次请求**自动读到最新 state，无需重启。

## API

前缀 `/api/v1`；健康检查 `/health`。

### `GET /health`

```json
{ "ok": true, "embedding": "connected", "vectorStore": "connected" }
```

### `GET /api/v1/collections`

```json
[
  {
    "id": "kb-...",
    "name": "产品手册库",
    "description": "",
    "documentCount": 12
  }
]
```

### `POST /api/v1/search`

```json
{
  "query": "退货时效是多久？",
  "collectionIds": ["kb-uuid-optional"],
  "topK": 8
}
```

响应 hits 带 **完整 `content`** 与 `sourceId`，不含 pipeline / observer，供 Agent 直接注入上下文。

**Agent 接入**（tool 定义、prompt 片段、多语言示例、错误语义）：[docs/agent-integration.md](./docs/agent-integration.md)

## Agent tool 示例

```json
{
  "name": "knowledge_search",
  "description": "从企业知识库检索与问题相关的文档片段",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "collection_ids": { "type": "array", "items": { "type": "string" } },
      "top_k": { "type": "integer" }
    },
    "required": ["query"]
  }
}
```

调用方映射：`collection_ids` → `collectionIds`，`top_k` → `topK`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `KNOWLEDGE_PORT` | 监听端口，默认 `3001` |
| `CONSOLE_STATE_PATH` | 控制台 state 路径，默认 `../server/data/state.json` |
| `PGVECTOR_CONNECTION_STRING` | 与 server 相同 |
| `EMBEDDING_*` | 检索必需 |
| `DOTSAI_*` | 全局策略开启 rewrite / rerank / compression / routing 时需要 |

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev:knowledge` | 开发（tsx watch） |
| `pnpm --filter @monai-ragsdk/knowledge test` | 单测 |
| `pnpm --filter @monai-ragsdk/knowledge build` | 编译 |

## 安全说明

当前无认证 / 多租户，与控制台一致。对外暴露前请自行加网关鉴权与库级授权。
