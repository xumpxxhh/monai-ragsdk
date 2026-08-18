# SDK 演进路线图

## 目的

本文档记录将当前 RAG 编排骨架演进为生产可用知识库 SDK 的阶段顺序、默认技术栈与实现授权边界。

它约束后续 AI 与开发者「先做什么、暂不做什么」，不替代各包交接文档中的 API 细节。

## 已确认决策

- **北极星**：近期把 RAG 内核做稳。`Collection`、文档生命周期以及 `ingest` / `search` / `ask` 门面只在后段预留，当前不新增一级 package。
- **阶段 1 重心**：完善 SDK（`core` / `indexing` / `adapters`），让全量 / 增量索引与默认 embedding / 存储路径在包内可闭环。`app/cli` 只是消费入口，不是本阶段完善对象。
- **阶段 1 默认栈**：全量 / 增量索引 + pgvector 读写闭环。OpenAI 兼容 embedding / chat 与 Ollama 都落在 `@monai-ragsdk/adapters`。
- **文档落点**：本决策文档是路线图唯一正文；不新建 `docs/roadmap/`。
- **当前状态**：阶段 1 已落地增量索引、Ollama adapter、OpenAI 兼容 embedding / chat adapter 与 pgvector `listSourceRecords`。阶段 2–4 仍需另一次明确授权。

## 现状

当前仓库是可替换实现的 RAG pipeline SDK，不是知识库产品 SDK。

已经具备：

- `core` 共享契约与错误模型
- `indexing` 离线主流程与 Phase D 保留契约
- `runtime` 在线四阶段编排与轻量后处理
- `adapters` 的 LangChain 适配、Chroma 写入、pgvector 写入与查询、Ollama embedding / chat、OpenAI 兼容 embedding / chat
- `observability` 最小 trace / observer / exporter
- `app/cli` 本地目录的 index / runtime / ask 验证入口

仍未具备：

- 知识库领域模型与统一门面
- 可发布包形态、CI、评测闭环
- 流式输出、citation、hybrid / 真实 rerank（阶段 2）

增量索引行为已按阶段 1 落地。层级召回仍未实现。详见 `docs/indexing/phase-d-contract-reservations.md`。

## 北极星

仓库继续作为 **可组装的 RAG 编排内核** 演进。生产知识库 SDK 是后续目标，不是当前实现范围。

近期只做：

1. 让全量 / 增量索引语义真实可用
2. 打通默认路径：OpenAI 兼容 embedding + OpenAI 兼容 chat + pgvector；Ollama 仍可选
3. 把第三方能力放在 `adapters`，契约放在 `core` / `indexing`，不要在业务入口重复实现

远期才做：

1. 知识库门面（Collection、文档生命周期、`ingest` / `search` / `ask`）
2. 发布基础设施与 `eval`

## 非目标

本路线图明确不做，或推迟到标注阶段之外：

- 不预建知识库空包，不提前拍板阶段 3 的包名（例如 `@monai-ragsdk/kb` 还是挂在 `runtime`）
- 不把 Chroma 查询侧、流式 chat、Pinecone 作为阶段 1 默认路径
- 不在阶段 1 实现层级召回 / parent-child retrieval
- 不提前扩散 `eval`、`utils`，不无故扩展 `runtime` 与 `observability` exporter
- 不把 CLI 能问答等同于 SDK 已可上线

## 四阶段

```text
阶段 1 内核可上线 -> 阶段 2 查询质量 -> 阶段 3 知识库门面 -> 阶段 4 发布与评测
```

阶段 1 内核能力已经落地。阶段 2–4 只立项顺序，不授权提前实现。

### 阶段 1：RAG 内核可上线

目标：全量 / 增量索引语义真实可用，默认 embedding / 存储路径可闭环。**本阶段已落地。**

`indexing`：

- 兑现 Phase D 已有契约：fingerprint skip / replace
- 在 `runIndexing` 中按约定调用 `deleteByFilter` 做 stale cleanup
- 补跨运行最小增量状态
- 不新开层级召回

`adapters`：

- 将 CLI 中的 Ollama embedder / generator 迁入本包
- 将 `PgVectorStoreAdapter` 与 `PgVectorRuntimeRetrieverAdapter` 作为默认读写路径补齐并稳定
- 为 embedding 调用补超时、重试与批处理
- 补 OpenAI 兼容 embedding 预设（`OpenAIEmbedder`），作为 CLI 默认 embedding 路径
- 补 OpenAI 兼容 chat 预设（`OpenAIRuntimeGenerator`），作为 CLI 默认 ask 路径；当前非流式

`app/cli`：

- 已改为消费 `@monai-ragsdk/adapters`，不再本地实现 Ollama
- 可作为本地验证入口，但阶段 1 不再以 CLI 体验、超时配置或连接生命周期为完善目标

本阶段后置：

- Chroma 查询侧
- 流式 chat、Pinecone 等其余云厂商预设
- 知识库门面

### 阶段 2：查询质量

目标：在仍无知识库门面的前提下，补查询期质量能力。

进入本阶段前，需要另一次明确授权，尤其是是否解冻 `runtime`。

候选范围：

- 流式输出
- citation / grounding 字段
- hybrid 检索与真实 rerank 默认策略
- 将 Chroma 查询对称作为第二存储路径

`observability` 在本阶段仍优先保持协议、失败隔离与 JSON-safe 约束，不提前对接 OTLP。

### 阶段 3：知识库门面

目标：在稳定内核之上增加知识库领域层。

预留能力：

- Collection
- 文档生命周期
- `ingest` / `search` / `ask`

约束：

- 门面只编排现有 `indexing` 与 `runtime`，不吞并包职责
- 包落点届时另开决策，禁止在阶段 1 预建空包

### 阶段 4：发布与评测

目标：让 SDK 可被下游安装，并补质量回归入口。

- 取消各包 `private: true`
- adapter 改为可选依赖或子路径导出
- 补 CI `verify` 与 changelog
- 再开 `eval`
- `utils` 仍默认不扩散

## 下一实现授权

阶段 1 已经落地，**不要自动进入阶段 2**。查询质量、流式、citation、解冻 `runtime` 需要另一次明确要求。

阶段 1 已授权并完成的范围：

允许：

- 在 `core` 中为增量索引或 Ollama / OpenAI 兼容 embedding / chat / pgvector 闭环做最小契约稳定
- 在 `indexing` 中实现真正的增量行为，并补对应 demo 与 unit test
- 在 `adapters` 中落地 Ollama adapter、OpenAI 兼容 embedding / chat、稳定 pgvector 读写闭环，并补对应 demo 与 unit test

不要主动改 `app/cli`，除非明确要求。

仍冻结：

- 新的一级 package
- 知识库门面实现
- `eval`、`utils` 的业务实现
- 无故扩展 `runtime`
- 无故扩展 `observability` exporter
- 将 Chroma 查询、流式 chat、Pinecone 当作阶段 1 范围

验证约束不变：建设测试、demo、integration 或 smoke 前仍遵循 `docs/decisions/verification-system-strategy.md`。包级验证仍优先放在 `core`、`indexing`、`adapters`；不要提前给 `runtime`、`eval`、`utils` 批量加测试。

## 与现有约束的关系

- 仓库级 Cursor rule：`.cursor/rules/project-constraints.mdc` 以本文档的阶段授权为准。
- 阶段状态与建议顺序：`docs/context/ai-handoff.md` 指向本文档，不再维护另一份过时清单。
- 增量契约细节：`docs/indexing/phase-d-contract-reservations.md` 继续描述「已经预留什么」；「何时实现」以本路线图阶段 1 为准。
- 依赖安装位置：仍遵循 `docs/decisions/package-installation-strategy.md`。Ollama 与 OpenAI 兼容 embedding 均走标准 HTTP，不因此提前引入新运行时依赖；pg 客户端已在 `adapters`。

## 相关文档

- `docs/decisions/README.md`
- `docs/context/ai-handoff.md`
- `docs/indexing/phase-d-contract-reservations.md`
- `docs/architecture/monorepo-structure.md`
- `.cursor/rules/project-constraints.mdc`
