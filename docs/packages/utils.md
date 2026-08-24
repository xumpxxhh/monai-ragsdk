# `@monai-ragsdk/utils` — 现状

> 快照：**2026-08-19** · 状态：**空包占位**
> 源码：`packages/utils/` · 用法：[README](../../packages/utils/README.md)
> 回：[routing.md](./routing.md)

## 1. 定位

工具包占位。按 SDK 演进约束，不要把「好像通用」的函数预堆到这里。可复用逻辑应先落在已授权的 `core` / `indexing` / `runtime` / `adapters` / `observability`。

## 2. 当前内容

| 项             | 事实                                       |
| -------------- | ------------------------------------------ |
| 入口           | `src/index.ts` 为 `export {}`              |
| workspace 依赖 | 无                                         |
| 被谁依赖       | 无任何包依赖本包                           |
| 测试 / demo    | 无                                         |
| 脚本           | 仅 `build`、`check-types`（能产出空 dist） |

## 3. 边界

- **不要**为了「工具该集中」而把 JSON 解析、RRF、filter helper 搬进本包。runtime 的契约工具已经在 `@monai-ragsdk/runtime/contract`。
- adapters 的 `shared/json.ts`、HTTP 封装属于厂商边界，留在 adapters。
- 若未来确有跨包、无领域语义的纯工具，再开决策授权本包；在此之前保持 `export {}`。

## 4. 与内核的关系

五个已授权包互不经过 `utils`。空包占住包名，避免出现第三套 `shared/utils`。

就绪度：0%。不是欠债，是未开工。
