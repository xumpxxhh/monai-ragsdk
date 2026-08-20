# `@monai-ragsdk/eval` — 现状

> 快照：**2026-08-19** · 状态：**空包占位**
> 源码：`packages/eval/` · 用法：[README](../../packages/eval/README.md)
> 回：[routing.md](./routing.md)

## 1. 定位

评测包占位。按 SDK 演进约束，评测能力未授权落地前保持空包，避免实现散落到未命名模块。

## 2. 当前内容

| 项 | 事实 |
| --- | --- |
| 入口 | `src/index.ts` 为 `export {}` |
| workspace 依赖 | 无 |
| 被谁依赖 | 无任何包依赖本包 |
| 测试 / demo | 无 |
| 脚本 | 仅 `build`、`check-types`（能产出空 dist） |

## 3. 边界

- **不要**在本包提前扩散评测实现、数据集加载、指标或 golden 集。
- 评测若立项，应单独开决策文档再动本包，不要从 runtime / adapters 里「顺便」长出 eval。
- 可复用的纯函数在授权前应落在已有的 `core` / `runtime` / `observability`，而不是预堆到这里。

## 4. 与内核的关系

内核主路径（索引 + 四段 pipeline + 观测）**不依赖**评测包。空包存在只为占住包名与目录，防止应用层私自新建第二套 eval。

就绪度：0%。不是欠债，是未开工。
