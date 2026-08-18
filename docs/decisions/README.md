# 决策文档索引

## 说明

本目录用于沉淀会直接影响后续 AI 与开发者行为的工程决策。

当仓库出现新的跨团队约束、依赖策略或验证策略时，应优先补充到本目录，而不是仅分散记录在聊天记录中。

## 当前文档

- `package-installation-strategy.md`：约束依赖应安装在根目录还是子包目录。
- `verification-system-strategy.md`：约束验证体系的引入时机、目录规则与执行顺序。
- `sdk-evolution-roadmap.md`：RAG 内核到知识库 SDK 的四阶段路线图、默认栈与实现授权边界。

## 当前阶段提示

- 仓库已完成 `core + indexing + adapters + runtime + observability` 的最小实现与验证；根目录已覆盖 `runtime + adapters` 与 `indexing + runtime` 两条最小跨包闭环。
- 演进方向已立项：先做稳 RAG 内核（增量索引、OpenAI 兼容 embedding / chat + pgvector 闭环，Ollama 仍可选），知识库门面后置。阶段 1 重心是完善 SDK，先不管 CLI。详见 `sdk-evolution-roadmap.md`。
- 阶段 1 已经落地；阶段 2 查询质量切片已落地。阶段 3 知识库门面 MVP 已挂在 `runtime.createCollection()`；完整文档生命周期与独立 kb 包仍冻结。Chroma 查询与第二查询路径已移出阶段 2。
- `eval` 与 `utils` 仍不应跳过阶段顺序提前实现；`runtime` 与 `observability` 无故不得继续扩散。

## 使用规则

- 如果需要安装依赖，先阅读 `package-installation-strategy.md`。
- 如果需要建设测试、demo、integration 或 smoke，先阅读 `verification-system-strategy.md`。
- 如果要判断下一阶段能改哪些包、默认走哪条生产路径，先阅读 `sdk-evolution-roadmap.md`。
- 如果现有决策已经过时，应先更新对应决策文档，再推动实现落地。
