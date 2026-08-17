# MonAI RAG SDK

TypeScript monorepo，提供可替换实现的检索增强生成（RAG）SDK。离线索引与在线查询分开编排，第三方能力通过 adapters 接入。

根包名：`monai-ragsdk`。子包统一使用 `@monai-ragsdk/*` 命名空间。

## 能力概览

- **索引**：文档加载、清洗、切分、chunk 增强、metadata 抽取、embedding、向量写入
- **查询**：预处理 → 检索 → 后处理 → 生成
- **适配**：LangChain loader / chunker / embedder / retriever / generator，以及 Chroma、pgvector 存储
- **观测**：trace / event / observer，以及 console、memory、JSONL exporter

`eval` 与 `utils` 尚未实现。`app/web` 仍为占位；本地端到端请使用 `app/cli`。

## 仓库结构

```text
.github/
app/
  cli/
  web/
docs/
packages/
  adapters/
  core/
  eval/
  indexing/
  observability/
  runtime/
  utils/
```

## 包说明

- `@monai-ragsdk/core`：共享领域模型、契约、错误类型
- `@monai-ragsdk/indexing`：离线索引编排与默认组件
- `@monai-ragsdk/runtime`：在线四阶段查询编排
- `@monai-ragsdk/adapters`：LangChain、Chroma、pgvector 等外部适配
- `@monai-ragsdk/observability`：tracing、observer、exporter
- `@monai-ragsdk/eval`：评测（尚未实现）
- `@monai-ragsdk/utils`：通用工具（尚未实现）
- `@monai-ragsdk/cli`：本地目录索引与问答的业务入口
- `@monai-ragsdk/web`：Web 入口（尚未实现）

## 常用命令

```bash
pnpm install
pnpm build
pnpm build:cli
pnpm cli -- --dir ./docs --query "MonAI RAG SDK 的 runtime 是什么？"
pnpm test
pnpm test:core
pnpm test:indexing
pnpm test:adapters
pnpm test:runtime
pnpm test:integration
pnpm check
pnpm smoke
pnpm verify
```

`app/cli` 用于本地资料目录的端到端验证，不纳入 SDK 主测试闭环。

## 文档入口

- `docs/context/ai-handoff.md`：仓库上下文与包边界
- `docs/context/core-package-handoff.md`：`core` 导出面与验证现状
- `docs/context/indexing-package-handoff.md`：`indexing` 边界与验证现状
- `docs/context/adapters-package-handoff.md`：`adapters` 依赖方向与验证现状
- `docs/context/runtime-package-handoff.md`：`runtime` 导出面与验证现状
- `docs/context/observability-package-handoff.md`：observer / exporter 设计边界
- `docs/indexing/indexing-extension-architecture-draft.md`：indexing 扩展点与 `indexing / adapters` 边界
- `docs/indexing/phase-d-contract-reservations.md`：层级索引与增量索引的保留契约
- `docs/examples/developer-integration-recommendations.md`：推荐接入方式
- `docs/runtime/runtime-package-requirements-design.md`：runtime 职责与设计基线
- `docs/runtime/runtime-api-usage-guide.md`：runtime API 与接入示例
- `docs/observability/observability-integration-guide.md`：可观测性最小接入
- `docs/architecture/monorepo-structure.md`：工程结构约定
- `docs/decisions/README.md`：工程决策索引
- `docs/decisions/package-installation-strategy.md`：依赖安装位置
- `docs/decisions/verification-system-strategy.md`：验证体系落地策略

## 工程约定

- `src/` 只保留 `.ts` 源码；构建产物统一输出到 `dist/`
- 包的对外入口指向 `dist/`，不指向 `src/`
- 文档使用中文
- 安装依赖前遵循 `docs/decisions/package-installation-strategy.md`
- 补充测试、demo、integration 或 smoke 前遵循 `docs/decisions/verification-system-strategy.md`
