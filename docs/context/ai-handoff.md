# AI 交接文档

## 目的

本文档用于帮助后续接手本仓库的 AI 或开发者快速理解当前状态、边界条件与建议的推进方向。

## 当前阶段

当前仓库已进入 `core + indexing + adapters + runtime + observability` 的最小实现与验证阶段，并已在根目录进入 integration / smoke 的初版落地；当前仅覆盖 `runtime + adapters` 与 `indexing + runtime` 两条最小跨包闭环。

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
- `packages/indexing` 已完成离线索引构建 MVP 第一版扩展骨架，并已补 `demo/`、`__tests__/`、`IndexingError`、chunk transformer / chunk filter / metadata extractor 与默认组件实现。
- `packages/adapters` 已完成 LangChain / Chroma 适配 MVP 第一版，当前已实现 loader adapter、text splitter adapter、semantic chunker adapter、header-aware chunk transformer、canonical metadata extractor、embedder adapter、runtime retriever / generator adapter、Chroma store adapter、demo 与 unit test。
- `packages/runtime` 已完成在线四阶段编排 MVP 第一版，当前已实现运行时类型与接口、`createRuntime()`、`createDefaultRuntime()`、`RuntimeError`、demo 与 unit test。
- `packages/observability` 已完成第一批最小可观测能力，当前已实现 trace / event / metric / error 协议、`RAGObserver`、`createConsoleObserver()`、`TraceExporter`、`createRAGObserver()`、console / memory / JSONL exporter 与 unit test。
- 根目录已补 `tests/integration/` 与 `tests/smoke/`，当前覆盖 `runtime + adapters` 与 `indexing + runtime` 两条最小跨包验证链路。

未完成内容：

- `eval`、`utils` 的实际实现。
- 统一的发布基础设施。
- 更完整的 integration / smoke 跨包验证覆盖。
- OpenAI、Pinecone 等后续适配实现。

## 重要约束

- 所有文档必须使用中文。
- 当前允许在 `core` 包中维护共享领域契约。
- 当前允许在 `indexing` 包中实现离线索引构建 MVP，并继续补 demo 与 unit test。
- 当前允许在 `adapters` 包中继续扩展 LangChain 适配 MVP，并继续补 demo 与 unit test。
- `observability` 当前已进入最小实现阶段；如需继续扩 observer / exporter 能力，应优先保持协议、失败隔离与 JSON-safe 约束稳定。
- `runtime` 当前已具备最小实现与验证闭环；除非明确要求，否则不要继续扩展该包实现或新增验证。
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
- `packages/indexing` 已补 `IndexingMode`、`sourceIdResolver`、`fingerprintResolver`、`VectorStoreWriteContext` 与可选 `deleteByFilter()` 的 Phase D 保留契约，但尚未实现真正的 stale cleanup 与层级召回行为。
- `packages/indexing` 的补充说明见 `docs/context/indexing-package-handoff.md`。
- `packages/runtime`：承载在线 RAG 查询链路的四阶段编排层，当前已完成 MVP 第一版。
- `packages/adapters`：承载外部能力适配层，当前已实现 `LangChainLoaderAdapter`、`LangChainDirectoryLoaderAdapter`、`LangChainMarkdownDirectoryLoader`、`LangChainTextSplitterAdapter`、`LangChainSemanticChunkerAdapter`、`LangChainHeaderAwareChunkTransformer`、`LangChainDocumentMetadataExtractor`、`LangChainEmbeddingsAdapter`、`LangChainRuntimeRetrieverAdapter`、`LangChainRuntimeGeneratorAdapter`、`createLangChainBaseRetrieverRuntimeAdapter`、`createLangChainChatModelRuntimeGenerator` 以及 recursive / token / markdown splitter 预设封装。
- `packages/adapters` 的补充说明见 `docs/context/adapters-package-handoff.md`。
- `packages/observability`：承载 tracing、metrics、observer 与 exporter 协议及最小实现；补充说明见 `docs/context/observability-package-handoff.md`。
- `packages/eval`：承载评测数据集、评测执行与指标相关骨架。
- `packages/utils`：承载日志、配置与辅助函数骨架。

## 建议的后续顺序

1. 明确各 package 的公开 API 边界。
2. 设计 package 之间的依赖方向。
3. 继续稳定 `core` 与 `indexing` 的公开导出面、demo 与测试覆盖。
4. 稳定 `adapters` 的 LangChain loader / chunker / metadata / transformer 导出面与测试覆盖。
5. 在既有 MVP 基础上继续稳定 `runtime` 对 `core`、`indexing` 与 `adapters` 的消费边界，并为后续 Phase D 留出扩展位。
6. 继续稳定 `observability` 的 observer / exporter 导出面与跨包接线说明，再按需要补更完整 exporter。
7. 在现有两条根级链路基础上，再按需要扩展 integration 与 smoke 覆盖面。
8. 在 `eval` 与 `utils` 开始真实实现后，再逐步补对应验证。

## 交接提醒

- 如果发现文档与仓库状态不一致，应先更新文档。
- 如果要引入新文件，优先放入既有目录体系中。
- 如果要增加脚本或依赖，应先判断是否超出了当前 `core + indexing + adapters + runtime` 的实现与验证边界。
- 如果要构建 package，构建产物只能进入 `dist/`，不要写回 `src/`。
- 如果要修改 `core`，先阅读 `docs/context/core-package-handoff.md`，避免破坏已存在的导出面与测试假设。
- 如果要修改 `indexing`，先阅读 `docs/context/indexing-package-handoff.md`，避免破坏当前 MVP 的主流程假设。
- 如果要修改 `adapters`，应先阅读 `docs/context/adapters-package-handoff.md`，确认第三方依赖安装位置、公开导出面与 demo/test 范围。
- 如果要修改 `runtime`，应先阅读 `docs/context/runtime-package-handoff.md` 与 `docs/runtime/runtime-api-usage-guide.md`，确认公开导出面、当前默认件行为与四阶段边界。
- 如果要修改 `observability`，应先阅读 `docs/context/observability-package-handoff.md`，确认 trace 协议、observer / exporter 生命周期与当前跨包接线现状。
- 如果要在 `core` 之外开始实际实现，应先确认是否已获得明确范围许可。
- 如果要安装依赖，先阅读 `docs/decisions/package-installation-strategy.md`，再决定装在根目录还是子包目录。
- 如果要开始建设测试、demo、integration 或 smoke，先阅读 `docs/decisions/verification-system-strategy.md`。
