# AI 交接文档

## 目的

本文档用于帮助后续接手本仓库的 AI 或开发者快速理解当前状态、边界条件与建议的推进方向。

## 当前阶段

当前仓库已完成 `core + indexing + adapters + runtime + observability` 的最小实现与验证，并已在根目录覆盖 `runtime + adapters` 与 `indexing + runtime` 两条最小跨包闭环。

演进方向已立项：**先做稳 RAG 内核，知识库门面后置**。阶段 1 重心是完善 SDK（`core` / `indexing` / `adapters`），`app/cli` 不是本阶段完善对象。阶段 1 能力（增量索引、Ollama / OpenAI 兼容 embedding 与 chat、pgvector 闭环）**已经落地**。阶段 2 仍需明确授权。完整顺序见 `docs/decisions/sdk-evolution-roadmap.md`。

已完成内容：

- monorepo 根目录与 `packages/`、`docs/` 目录骨架。
- `pnpm-workspace.yaml` 与 `pnpm-lock.yaml`。
- 7 个一级 package 的最小 package manifest。
- 每个 package 的 `src/index.ts` 源码入口。
- 每个 package 的 `tsconfig.json` 已统一收敛到 `src -> dist` 输出模式。
- 根级 TypeScript project references。
- 所有 package 已统一切换为 `src -> dist` 的构建约定。
- Git 仓库初始化与最小 `.gitignore`。
- 基础中文文档与仓库级 Cursor rule（`.cursor/rules/project-constraints.mdc`）。
- 根目录已安装 `typescript`、`tsx`、`vitest`。
- `packages/core` 已开始实现共享领域契约，并已引入 `zod`。
- `packages/core` 已补 `demo/` 与 `__tests__/`，并可通过包级与根级脚本运行验证。
- `packages/indexing` 已完成离线索引构建 MVP，并已落地增量索引行为：fingerprint skip/replace、`deleteByFilter` stale cleanup、`listSourceRecords` 跨运行状态。
- `packages/adapters` 已完成 LangChain / Chroma 适配 MVP，并已补 Ollama embedder / generator、OpenAI 兼容 embedder / generator、pgvector 写入 / 删除 / `listSourceRecords` / runtime retriever。
- `packages/runtime` 已完成在线四阶段编排 MVP 第一版，当前已实现运行时类型与接口、`createRuntime()`、`createDefaultRuntime()`、`RuntimeError`、demo 与 unit test。
- `packages/observability` 已完成第一批最小可观测能力，当前已实现 trace / event / metric / error 协议、`RAGObserver`、`createConsoleObserver()`、`TraceExporter`、`createRAGObserver()`、console / memory / JSONL exporter 与 unit test。
- 根目录已补 `tests/integration/` 与 `tests/smoke/`，当前覆盖 `runtime + adapters` 与 `indexing + runtime` 两条最小跨包验证链路。

未完成内容：

- 流式输出、citation、hybrid / 真实 rerank（阶段 2）。
- `eval`、`utils` 的实际实现。
- 统一的发布基础设施。
- 更完整的 integration / smoke 跨包验证覆盖。
- 知识库门面（Collection、`ingest` / `search` / `ask`）。
- Pinecone 等后续适配实现。

## 重要约束

- 所有文档必须使用中文。
- 阶段顺序与实现授权以 `docs/decisions/sdk-evolution-roadmap.md` 为准。
- 当前允许在 `core` 包中维护共享领域契约。
- 当前允许在 `indexing` 包中继续离线索引与增量行为，并补 demo 与 unit test。
- 当前允许在 `adapters` 包中继续外部适配；默认栈为 OpenAI 兼容 embedding / chat + pgvector，Ollama 仍可选。
- 不要主动改 `app/cli`，除非明确要求。
- `observability` 当前已进入最小实现阶段；如需继续扩 observer / exporter 能力，应优先保持协议、失败隔离与 JSON-safe 约束稳定。
- `runtime` 当前已具备最小实现与验证闭环；阶段 2 之前不要继续扩展该包实现或新增验证，除非明确要求。
- 不要新增一级 package，不要实现知识库门面，不要提前实现 `eval` 与 `utils`。
- 除非明确要求，否则不要添加依赖；已批准依赖应按决策文档安装。
- 已存在文件若需修改，应优先保持最小改动。
- `src/` 目录只允许存放 `.ts` 源码，构建产物必须统一输出到 `dist/`。
- 如果需要安装依赖，必须先遵循 `docs/decisions/package-installation-strategy.md`。
- 如果需要建设测试、demo、integration 或 smoke，必须先遵循 `docs/decisions/verification-system-strategy.md`。

## 当前工程事实

- 包管理器：`pnpm`
- workspace 范围：`packages/*`
- 语言基线：TypeScript
- 模块类型：ES Module
- 根级 TypeScript 解析策略：`Bundler`
- package 级构建策略：`NodeNext` + `dist/` 输出
- 根仓库已启用 project references
- 当前 7 个 package 均为独立 workspace 包

## package 概览

- `packages/core`：承载核心抽象边界。
- `packages/core` 当前已进入实施阶段，开始沉淀共享 schema、type、interface、error 与轻量 pipeline 抽象，并已补充 `Document` / `Vector` 共享模型。
- `packages/core` 的补充说明见 `docs/context/core-package-handoff.md`。
- `packages/indexing`：承载数据导入、切片、chunk 级增强、metadata 抽取、嵌入、写入相关 MVP。
- `packages/indexing` 当前已复用 `@monai-ragsdk/core` 的 `Document` / `Chunk` / `Vector`，并实现 `Loader` / `Chunker` / `DocumentTransformer` / `ChunkTransformer` / `ChunkFilter` / `MetadataExtractor` / `Embedder` / `VectorStore` 抽象、`SimpleChunker`、`ContentCleanupTransformer`、`ContextualHeaderTransformer`、`HashDedupChunkFilter`、`BasicMetadataExtractor`、`MockEmbedder`、`MemoryVectorStore`、`IndexingError` 与 `runIndexing`。
- `packages/indexing` 已补增量索引行为：fingerprint skip/replace、`deleteByFilter` stale cleanup、`listSourceRecords` 跨运行状态。层级召回仍未实现。
- `packages/indexing` 的补充说明见 `docs/context/indexing-package-handoff.md`。
- `packages/runtime`：承载在线 RAG 查询链路的四阶段编排层，当前已完成 MVP 第一版。
- `packages/adapters`：承载外部能力适配层，当前已实现 LangChain 适配、Chroma 写入、pgvector 读写、`OllamaEmbedder`、`OllamaRuntimeGenerator`、`OpenAIEmbedder` 与 `OpenAIRuntimeGenerator`。
- `packages/adapters` 的补充说明见 `docs/context/adapters-package-handoff.md`。
- `packages/observability`：承载 tracing、metrics、observer 与 exporter 协议及最小实现；补充说明见 `docs/context/observability-package-handoff.md`。
- `packages/eval`：承载评测数据集、评测执行与指标相关骨架。
- `packages/utils`：承载日志、配置与辅助函数骨架。

## 建议的后续顺序

完整阶段划分、默认栈与授权边界以 `docs/decisions/sdk-evolution-roadmap.md` 为准：

1. 阶段 1（已落地，重心在 SDK）：增量索引、Ollama / OpenAI 兼容 embedding / chat、pgvector 读写闭环。不要主动改 CLI。
2. 阶段 2：查询质量（流式、citation、hybrid / rerank；需要时再解冻 `runtime`）。
3. 阶段 3：知识库门面（Collection、`ingest` / `search` / `ask`；包落点另开决策）。
4. 阶段 4：发布与评测（取消 `private`、CI、再开 `eval`）。

未收到阶段 2 授权前，不要解冻 `runtime`，也不要开始知识库门面。

## 交接提醒

- 如果发现文档与仓库状态不一致，应先更新文档。
- 如果要引入新文件，优先放入既有目录体系中。
- 如果要增加脚本或依赖，应先判断是否超出了 `docs/decisions/sdk-evolution-roadmap.md` 当前授权的实现边界。
- 如果要构建 package，构建产物只能进入 `dist/`，不要写回 `src/`。
- 如果要修改 `core`，先阅读 `docs/context/core-package-handoff.md`，避免破坏已存在的导出面与测试假设。
- 如果要修改 `indexing`，先阅读 `docs/context/indexing-package-handoff.md`，避免破坏当前 MVP 的主流程假设。
- 如果要修改 `adapters`，应先阅读 `docs/context/adapters-package-handoff.md`，确认第三方依赖安装位置、公开导出面与 demo/test 范围。
- 如果要修改 `runtime`，应先阅读 `docs/context/runtime-package-handoff.md` 与 `docs/runtime/runtime-api-usage-guide.md`，确认公开导出面、当前默认件行为与四阶段边界。
- 如果要修改 `observability`，应先阅读 `docs/context/observability-package-handoff.md`，确认 trace 协议、observer / exporter 生命周期与当前跨包接线现状。
- 如果要在当前授权范围之外开始实际实现，应先确认是否已获得明确范围许可。
- 如果要判断下一阶段做什么，先阅读 `docs/decisions/sdk-evolution-roadmap.md`。
- 如果要安装依赖，先阅读 `docs/decisions/package-installation-strategy.md`，再决定装在根目录还是子包目录。
- 如果要开始建设测试、demo、integration 或 smoke，先阅读 `docs/decisions/verification-system-strategy.md`。
