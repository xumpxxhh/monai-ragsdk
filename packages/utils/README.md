# `@monai-ragsdk/utils`

## 定位

工具包占位。当前入口是空的 `export {}`，没有共享工具实现、没有测试、没有 demo。

## 依赖

无 workspace 依赖，也没有任何包依赖本包。

## 边界

按 SDK 演进约束，不要在 `utils` 里提前扩散实现。可复用逻辑应先落在已授权的 `core` / `indexing` / `runtime` / `adapters` / `observability`，而不是往这里预堆工具函数。
