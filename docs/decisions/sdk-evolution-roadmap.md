# SDK 演进路线图

## 目的

本文档记录将当前 RAG 编排骨架演进为生产可用知识库 SDK 的阶段顺序、默认技术栈与实现授权边界。

它约束后续 AI 与开发者「先做什么、暂不做什么」，不替代各包交接文档中的 API 细节。

## 已确认决策

- **北极星**：近期把 RAG 内核做稳。知识库门面不新增一级 package；阶段 3 MVP 已挂在 `@monai-ragsdk/runtime` 的 `createCollection()` 上。完整文档生命周期与独立 kb 包仍后置。
- **阶段 1 重心**：完善 SDK（`core` / `indexing` / `adapters`），让全量 / 增量索引与默认 embedding / 存储路径在包内可闭环。`app/cli` 只是消费入口，不是本阶段完善对象。
- **阶段 1 默认栈**：全量 / 增量索引 + pgvector 读写闭环。OpenAI 兼容 embedding / chat 与 Ollama 都落在 `@monai-ragsdk/adapters`。
- **文档落点**：本决策文档是路线图唯一正文；不新建 `docs/roadmap/`。
- **阶段 2 范围收口**：查询质量只在默认 pgvector 路径上做。不补 Chroma 查询侧，不新增第二查询 / 第二存储路径。
- **当前状态**：阶段 1 已落地。阶段 2 流式生成、citation / grounding、pipeline 策略框架、Query Routing、真实 rerank（LLM 策略件）与 Context Compression 已落地。阶段 3 知识库门面 **MVP 已落地**（`createCollection` + `ingest` / `search` / `ask`，挂在 `runtime`，未新开一级 package）。`search()` 为 retrieve-only（`runtime.search()`，不走 generation）。完整文档生命周期、独立 kb 包与 Active RAG 仍冻结。Chroma 查询与第二查询路径已移出阶段 2。

## 现状

当前仓库是可替换实现的 RAG pipeline SDK，不是知识库产品 SDK。

已经具备：

- `core` 共享契约、错误模型，以及一次查询的审计快照（`RAGResponse`）
- `indexing` 离线主流程与 Phase D 保留契约
- `runtime` 在线四阶段编排、轻量后处理、流式生成（`runStream`）、grounding 引用（`citations`）与全流程审计快照
- `runtime` 上的知识库门面 MVP：`createCollection()`，编排 `ingest` / `search` / `ask`，以及 store 能力允许时的 `listSources` / `deleteByFilters` / `close`
- `adapters` 的 LangChain 适配、Chroma 写入、pgvector 写入与查询、Ollama embedding / chat、OpenAI 兼容 embedding / chat
- `observability` 最小 trace / observer / exporter
- `app/cli` 本地目录的 index / runtime / ask 验证入口

仍未具备：

- 完整文档生命周期（版本管理、按 source 自动 replace 的更细门面策略、产品化生命周期 API）
- 独立知识库一级 package（当前门面挂在 `runtime`，包落点仍未另开决策）
- 可发布包形态、CI、评测闭环
- hybrid（仍冻结）/ 默认真实 rerank 策略（仍冻结为“默认开启”，但 LLM rerank 能力本身已提供可组合策略件）
- Chroma 查询侧与第二查询路径（已移出阶段 2）

增量索引行为已按阶段 1 落地。层级召回仍未实现。详见 `docs/indexing/phase-d-contract-reservations.md`。

## 北极星

仓库继续作为 **可组装的 RAG 编排内核** 演进。生产知识库 SDK 是后续目标，不是当前实现范围。

近期只做：

1. 让全量 / 增量索引语义真实可用
2. 打通默认路径：OpenAI 兼容 embedding + OpenAI 兼容 chat + pgvector；Ollama 仍可选
3. 把第三方能力放在 `adapters`，契约放在 `core` / `indexing`，不要在业务入口重复实现

远期仍后置：

1. 完整文档生命周期与（若需要）独立知识库一级 package
2. 发布基础设施与 `eval`

## 非目标

本路线图明确不做，或推迟到标注阶段之外：

- 不预建知识库空包；阶段 3 MVP 已挂在 `runtime.createCollection()`。独立 kb 包若要再拆，须另开决策
- 不把 Chroma 查询侧、流式 chat、Pinecone 作为阶段 1 默认路径
- 不在阶段 2 补 Chroma 查询，也不新增第二查询 / 第二存储路径；默认查询继续只走 pgvector
- 不在阶段 1 实现层级召回 / parent-child retrieval
- 不提前扩散 `eval`、`utils`，不无故扩展 `runtime` 与 `observability` exporter
- 不把 CLI 能问答等同于 SDK 已可上线

## 四阶段

```text
阶段 1 内核可上线 -> 阶段 2 查询质量 -> 阶段 3 知识库门面 -> 阶段 4 发布与评测
```

阶段 1 内核能力已经落地。阶段 2 查询质量切片已落地。阶段 3 知识库门面 MVP 已挂在 `runtime`，未新开一级 package。Chroma 查询与第二查询路径已移出阶段 2。

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

目标：在稳定内核之上补查询期质量能力。门面 MVP 当时尚未落地，本阶段不依赖 Collection。

当前已授权并落地的切片：

- 流式输出：`RuntimeGenerator.generateStream()` 为可选能力；`runtime.runStream()` 在 generation 阶段向外推 `delta`，最后给出与 `run()` 同构的 `result`
- `OpenAIRuntimeGenerator` 走 OpenAI 兼容 SSE；`OllamaRuntimeGenerator` 走 NDJSON
- 没有 `generateStream` 的 generator（例如当前 LangChain 适配）回退为一次 `generate()`，把完整答案当成单段 delta
- `runtime.run()` 仍走非流式 `generate()`，不把流式超时/重试语义套到 JSON 调用上
- citation / grounding：`RuntimeResult.citations` 按进入 generation 的 chunks 生成；`run()` 与 `runStream()` 同构。不解析答案标记，也不要求 generator 另产出引用
- 全流程审计快照：`RAGResponse` 为 core 契约；`RuntimeResult` 主体对齐该快照，`run()` / `runStream()` 始终写入溯源、决策留痕与回放具名字段。`includeDebug` 只控制是否附带完整过程 `debug`。压缩若改写正文，原文放 `originalContent`，时间字段为 Unix 毫秒时间戳
- pipeline 策略框架：`QueryStrategy` / `PostRetrievalStrategy` 可组合链；`StrategyQueryPreprocessor`、`StrategyRetrievalPostprocessor`、`FanOutRetriever`；`RetrievalRequest.subQueries` 供 multi-query fan-out；RRF 上移到 runtime（`fuseByReciprocalRankFusion`）；示范策略 `Lost in the Middle`；`RuntimeStrategyModel` 抽象 + adapters 侧 `OpenAIStrategyModel` / `OllamaStrategyModel`
- pre-retrieval LLM 策略：`createQueryRewriteStrategy`、`createQueryExpansionStrategy`、`createQueryDecompositionStrategy`、`createMultiQueryStrategy`；依赖注入的 `RuntimeStrategyModel`；LLM 失败默认透传原 query
- pre-retrieval LLM 策略：Query Routing（`createQueryRoutingStrategy`）写回 `request.route`、可选 budget/topK/filters
- post-retrieval 策略：真实 rerank（`createLlmRerankStrategy`，LLM 重排序并可写回 candidate.score）
- post-retrieval 策略：Context Compression（`createContextCompressionStrategy`，LLM 压缩 chunk.content，影响 promptContext）

其余候选范围仍需另一次明确授权：

阶段 2 明确不做：

- Chroma 查询侧
- 第二查询 / 第二存储路径；默认查询继续只走 pgvector

进入其余切片前，尤其是继续扩展 `runtime` 编排时，需要明确要求。

`observability` 在本阶段仍优先保持协议、失败隔离与 JSON-safe 约束，不提前对接 OTLP。

### 阶段 3：知识库门面

目标：在稳定内核之上增加知识库领域层。**MVP 已落地，挂在 `@monai-ragsdk/runtime`，未新开一级 package。**

已落地：

- `createCollection({ indexing, runtime })`：只编排现有 `runIndexing` 与 `runtime.run` / `runtime.search`，不吞并包职责
- `ingest(documents)`：写入向量库；可覆盖 `mode` / `observer` / `trace` / `batchSize`，增量语义仍由 indexing 的 fingerprint / `deleteByFilter` 兑现
- `search()`：retrieve-only。复用 `runtime.search()`（pre-retrieval → retrieval → post-retrieval），不调用 generator；返回检索侧审计快照（`chunks` / `citations` / `effectiveQuery` 等），没有 `answer`
- `ask()`：透出完整 `RuntimeResult`（core 审计快照）
- store 能力允许时：`listSources()`、`deleteByFilters()`、`close()`（能力缺失返回空数组 / `false`，不当成硬错误）
- 包级 demo（`demo/collection-demo.ts`）与 unit test（`__tests__/collection.spec.ts`）；用法见 `docs/runtime/collection-api-usage-guide.md`

仍冻结 / 未做：

- 完整文档生命周期（版本管理、更细的自动 replace 策略、产品化生命周期 API）
- 独立知识库一级 package（例如 `@monai-ragsdk/kb`）；包落点若要再拆，须另开决策

约束不变：

- 门面只编排现有 `indexing` 与 `runtime`，不吞并包职责
- 禁止为此新开一级 package，除非另开决策
- 完整生命周期方法仍需二次明确授权

### 阶段 4：发布与评测

目标：让 SDK 可被下游安装，并补质量回归入口。

- 取消各包 `private: true`
- adapter 改为可选依赖或子路径导出
- 补 CI `verify` 与 changelog
- 再开 `eval`
- `utils` 仍默认不扩散

## 下一实现授权

阶段 2 citation / grounding、pipeline 策略框架、pre-retrieval LLM 策略、真实 rerank 与 Context Compression 已经落地。阶段 3 知识库门面 **MVP 已落地**（`runtime.createCollection`）；`search()` 已改为 retrieve-only（`runtime.search()`）。仍冻结 Active RAG / Self-Correction、hybrid（真正 rerank 默认开启）、完整文档生命周期、独立 kb 包与其它二次查询路径。

阶段 1 已授权并完成的范围：

允许：

- 在 `core` 中为增量索引或 Ollama / OpenAI 兼容 embedding / chat / pgvector 闭环做最小契约稳定
- 在 `indexing` 中实现真正的增量行为，并补对应 demo 与 unit test
- 在 `adapters` 中落地 Ollama adapter、OpenAI 兼容 embedding / chat、稳定 pgvector 读写闭环，并补对应 demo 与 unit test

阶段 2 当前切片允许：

- 在 `runtime` 中维护可组合策略框架（query / post-retrieval 策略链、fan-out retriever、RRF 融合、Lost in the Middle 等）
- 在 `runtime` 中落地 LLM 类 pre-retrieval 策略件（rewrite / expansion / decomposition / multi-query），依赖注入的 `RuntimeStrategyModel`
- 策略件本体落在 `runtime`（含 prompt 模板与解析逻辑）；绑定厂商或第三方协议的实现落在 `adapters`
- 保持 `run()` 与 `runStream()` 的最终 result 同构

不要主动改 `app/cli`，除非明确要求。

仍冻结：

- 新的一级 package（含独立知识库包）
- 完整文档生命周期（超出当前 `listSources` / `deleteByFilters` / `close` 的产品化门面）
- `eval`、`utils` 的业务实现
- hybrid
- 真实 rerank 默认策略（仍冻结为“默认开启”，但能力本身可通过策略链显式启用）
- 答案内 citation 标记解析，或要求 generator 另产出引用
- Chroma 查询侧、第二查询 / 第二存储路径
- 无故继续扩展 `runtime` 编排（维护已落地的 Collection MVP 与审计快照除外）
- 无故扩展 `observability` exporter
- Pinecone 等其余云厂商预设

验证约束不变：建设测试、demo、integration 或 smoke 前仍遵循 `docs/decisions/verification-system-strategy.md`。包级验证仍优先放在 `core`、`indexing`、`adapters` 与已解冻的 `runtime` citation 切片；不要提前给 `eval`、`utils` 批量加测试。

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
