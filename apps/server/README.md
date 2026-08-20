# MonAI RAG 控制台后台（Express）

`apps/web` 的 REST / SSE 后端。编排 SDK `createCollection()` 的 ingest / search / ask，不另开知识库包。

## 启动

```bash
pnpm install
copy apps\server\.env.example apps\server\.env
# 填入 EMBEDDING_API_KEY / DOTSAI_API_KEY，并确认 PostgreSQL + pgvector 可连

pnpm dev:server
```

默认监听 `http://localhost:3000`。健康检查：`GET /health`。业务 API 前缀：`/api/v1`。

接口说明：[docs/server/api.md](../../docs/server/api.md)。ask/search 为全局路由（`POST /api/v1/ask|search`）；web 迁移见 [docs/server/web-followup.md](../../docs/server/web-followup.md)。

## 与 Web 联调

1. 保持本服务运行。
2. 前端开发时 Vite 已把 `/api` 代理到 `localhost:3000`。
3. 在 `apps/web/.env.development` 设 `APP_USE_MOCK=false` 后执行 `pnpm dev:web`。

生产构建的 web 默认 `APP_API_BASE_URL=/api/v1`，需要网关把该前缀转到本服务。

## 环境变量与 Turbo 注入

见 [`.env.example`](.env.example)。变量名与 `apps/example` 对齐。

本仓 Turbo 2 默认 **Strict** 环境模式：任务进程只能看到已声明的变量。密钥与运行时连接串**不要**写进 `globalEnv` / `env`（会进缓存 hash），应放在：

| 声明位置 | 作用 |
| --- | --- |
| 根 [`turbo.json`](../../turbo.json) 的 `globalPassThroughEnv` | 全仓透传，不进缓存键（`pnpm example` / CLI / server 共用） |
| [`apps/server/turbo.json`](./turbo.json) 的 `dev` / `start`.`passThroughEnv` | 本包长驻任务显式允许列表 |

本地推荐两种注入方式（可并存；**已存在的 `process.env` 优先**，文件不会覆盖 shell/CI）：

1. **`apps/server/.env`**（开发主路径）：进程启动时由 [`src/config/env.ts`](./src/config/env.ts) 读取，不依赖 Turbo 透传。
2. **Shell / CI 注入**：变量名必须已在上述 `passThroughEnv` / `globalPassThroughEnv` 中列出，否则 `turbo run` 会滤掉。

| 变量 | 用途 |
| --- | --- |
| `PORT` | 监听端口，默认 3000 |
| `CORS_ORIGIN` | 允许的前端源，默认 `http://localhost:5173` |
| `PGVECTOR_CONNECTION_STRING` | pgvector 连接串 |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSION` | Embedding |
| `DOTSAI_API_KEY` / `DOTSAI_BASE_URL` / `DOTSAI_CHAT_MODEL` | Chat 与策略 LLM |

约定说明见 [`docs/turborepo.md`](../../docs/turborepo.md) 中 `globalPassThroughEnv` / `globalEnv` 一节。

知识库元数据在 `data/state.json`（已 gitignore）；每个知识库使用独立 pgvector 表 `kb_<id>`。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev:server` | 经 Turbo 跑 `tsx watch` |
| `pnpm --filter @monai-ragsdk/server build` | 编译到 `dist/` |
| `pnpm --filter @monai-ragsdk/server start` | 运行编译产物 |
| `pnpm dev:server:debug` | 带 Inspector（9229），可命中源码里的 `debugger` |

### 调试 `debugger`

不要用 `pnpm dev` / Turbo 包一层；Inspector 挂不上或难附着。任选其一：

1. **Cursor / VS Code**：Run and Debug → `Debug Server (tsx)`（F5）。触发入库等走到 `debugger;` 会暂停。
2. **终端先起再附着**：`pnpm dev:server:debug`，再 F5 选 `Attach Server :9229`。
3. **启动即暂停**：`pnpm --filter @monai-ragsdk/server dev:debug-brk`。

说明：`debugger;` 只在已附着调试器时停住；普通 `dev` 下会被跳过或几乎无感。
