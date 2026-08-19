# MonAI RAG 控制台（Web）

基于 `docs/frontend/architecture.md` 的生产级前端应用，UI 对齐 `docs/prototype/monai-rag-console` 原型。
REST / SSE 契约见 `docs/server/api.md`。

## 开发

```bash
pnpm install
# 先启动后台（默认 http://localhost:3000）
pnpm dev:server
# 再启动前端（端口 5173；/api 代理到 server）
pnpm dev:web
```

`APP_API_BASE_URL` 保持 `/api/v1`；Vite 会把 `/api` 代理到 `http://localhost:3000`。后台配置见 `apps/server/README.md`。

## 脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev:web` | 开发服务器（端口 5173） |
| `pnpm build:web` | 生产构建 |
| `pnpm start:web` | 预览生产构建 |

## 目录

- `src/features/` — 业务页面（工作台、知识库、问答、观测等）
- `src/shared/api/` — HTTP / SSE 客户端（按资源划分，对接 `/api/v1`）
- `src/shared/types/` — 与后端对齐的 DTO 类型
- `src/layouts/` — AppShell 导航壳

## 环境变量

见 `.env.development` / `.env.production`：

- `APP_BASE_PATH` — 路由 basename
- `APP_API_BASE_URL` — REST 根路径（开发默认 `/api/v1`）
