# MonAI RAG 控制台（Web）

基于 `docs/frontend/architecture.md` 的生产级前端应用，UI 对齐 `docs/prototype/monai-rag-console` 原型。

## 开发

```bash
pnpm install
pnpm dev:app
```

默认启用 Mock 数据（`APP_USE_MOCK=true`）。接入真实 API 时：

1. 设置 `APP_USE_MOCK=false`
2. 配置 `APP_API_BASE_URL`（如 `/api/v1`）
3. 确保后端实现 `shared/api/` 中对应 REST 契约

## 脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev:app` | 开发服务器（端口 5173） |
| `pnpm build:app` | 生产构建 |
| `pnpm start:app` | 预览生产构建 |

## 目录

- `src/features/` — 业务页面（工作台、知识库、问答、观测等）
- `src/shared/api/` — HTTP 封装 + Mock 代理（按资源划分，便于切换真实接口）
- `src/shared/types/` — 与后端对齐的 DTO 类型
- `src/layouts/` — AppShell 导航壳

## 环境变量

见 `.env.development` / `.env.production`：

- `APP_BASE_PATH` — 路由 basename
- `APP_API_BASE_URL` — REST 根路径
- `APP_USE_MOCK` — 是否使用 Mock（`false` 时走真实 HTTP）
