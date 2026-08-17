# 决策文档索引

## 说明

本目录用于沉淀会直接影响后续 AI 与开发者行为的工程决策。

当仓库出现新的跨团队约束、依赖策略或验证策略时，应优先补充到本目录，而不是仅分散记录在聊天记录中。

## 当前文档

- `package-installation-strategy.md`：约束依赖应安装在根目录还是子包目录。
- `verification-system-strategy.md`：约束验证体系的引入时机、目录规则与执行顺序。

## 当前阶段提示

- 根目录的验证工具已最小落地，`core`、`indexing`、`adapters` 与 `runtime` 已进入 demo 与 unit test 阶段，`observability` 已进入最小实现与 unit test 阶段。
- 根目录已具备初版 `test:integration` 与 `smoke` 链路，当前覆盖 `runtime + adapters` 与 `indexing + runtime` 两条最小跨包闭环。
- `eval` 与 `utils` 仍不应跳过阶段顺序，直接批量引入测试或 smoke；`observability` 后续扩展也应继续遵守最小实现优先的节奏。

## 使用规则

- 如果需要安装依赖，先阅读 `package-installation-strategy.md`。
- 如果需要建设测试、demo、integration 或 smoke，先阅读 `verification-system-strategy.md`。
- 如果现有决策已经过时，应先更新对应决策文档，再推动实现落地。
