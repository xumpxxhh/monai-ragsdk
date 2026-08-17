# core demo

本目录用于放置 `@monai-ragsdk/core` 的最小验证案例。

可用脚本：

- `pnpm --filter @monai-ragsdk/core demo:runtime-like`
- `pnpm --filter @monai-ragsdk/core demo:schema-parse`
- `pnpm --filter @monai-ragsdk/core demo:errors`
- `pnpm --filter @monai-ragsdk/core demo:pipeline-like`

约束：

- demo 文件只能放在 `demo/`，不要放进 `src/`。
- demo 以消费 `dist/` 为准，用来验证包的对外出口是否可用。
- demo 的目标是验证最小可用路径，不替代单元测试。
