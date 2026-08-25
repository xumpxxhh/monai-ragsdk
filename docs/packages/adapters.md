# `@monai-ragsdk/adapters` — 现状

> 快照：**2026-08-24** · 状态：**可用**
> 源码：`packages/adapters/` · 用法：[README](../../packages/adapters/README.md)
> 回：[routing.md](./routing.md)

## 1. 定位

外部适配层。把 LangChain、OpenAI 兼容 HTTP、Ollama、pgvector、Chroma 填进 [indexing](./indexing.md) / [runtime](./runtime.md) 的接口。

**策略与编排不在本包。** 库不再依赖 adapters，把厂商锁在最外一层。

依赖：`core`、`indexing`、`runtime`；第三方 `@langchain/*`、`openai`、`pg`、`chromadb`。

被谁用：只有应用层（`apps/example`、`apps/server`、`apps/web`）。

不直接依赖 `observability`：适配器只做事，trace 由 indexing / runtime 上报。

实现 Retriever 时从 `@monai-ragsdk/runtime/contract` 引用契约工具，不要从 runtime 包根捡内部函数。

## 2. 边界

- 不定义 pipeline 策略，不实现 `createCollection`。
- 不补 Chroma 查询，不新增第二套存储 / 查询路径。
- 不要把策略件本体搬进本包；LLM 调用实现可以留在这里。
- `baseUrl` / `model` 由调用方显式传入，SDK 不内置厂商 URL。

密钥不要写进配置文件：

| 用途           | 环境变量            | 类                                                                           |
| -------------- | ------------------- | ---------------------------------------------------------------------------- |
| embedding      | `EMBEDDING_API_KEY` | `OpenAIEmbedder`                                                             |
| ask / 策略模型 | `OPENAI_API_KEY`    | `OpenAIRuntimeGenerator`、`OpenAIStrategyModel`（经共享 `OpenAIChatClient`） |

两套 key 分开，避免和 embedding 混用。同一套 chat 配置应优先用 `createOpenAIChatAdapters()`，让 Generator 与 StrategyModel 共用一个 client。

## 3. 适配一览

| 分组        | 接到哪一层                                                                                         | 现状                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI 兼容 | indexing `Embedder`；runtime `Generator` / `StrategyModel`                                         | 官方 `openai` SDK；`OpenAIChatClient` + `createOpenAIChatAdapters`；类名 `OpenAIEmbedder` / `OpenAIRuntimeGenerator` / `OpenAIStrategyModel` 保持兼容            |
| Ollama      | 同上                                                                                               | `OllamaEmbedder`、`OllamaRuntimeGenerator`、`OllamaStrategyModel`（仍自研 HTTP）                                                                                 |
| pgvector    | indexing `VectorStore`；runtime `Retriever`                                                        | **默认查询路径**；默认向量 + 关键词 + RRF；`searchType: vector/keyword` 时单路；`id` 默认 `pgvector`，`searchTypes: ['vector', 'keyword', 'hybrid']`，有 `close` |
| LangChain   | indexing loader / chunker / embedder / metadata / chunk-transformer；runtime retriever / generator | 文档加载与切分的主路径                                                                                                                                           |
| Chroma      | 仅 `VectorStore.upsert`                                                                            | **只写不查**                                                                                                                                                     |

默认栈：**OpenAI 兼容 embedding / chat + pgvector**。Ollama 仍可选。

## 4. 两个 Retriever 对同一 request 的差异

这是契约诊断里的高危项 3，**部分被 runtime 编排层盖住，adapter 自身分叉仍在**：

| 维度                | pgvector                                                                                        | langchain（默认路径）                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 条数限制            | 读 `budget.maxChunks ?? 3`，filter 后 slice                                                     | **不读** topK/budget，不截断                                                                                     |
| 融合                | 缺省 / `hybrid`：向量 + 关键词 + RRF，`scoreKind: rrf`；`vector` / `keyword` 单路为 `retriever` | 无，单次 invoke；有 `document.score` 时 `scoreKind: retriever`。请求的 `searchType` 不在能力内则忽略，不假装切换 |
| filters             | adapter 内预过滤 + runtime 再强制（幂等）                                                       | `filterByRequest: false` 时 adapter 不预过滤；**runtime 仍强制**                                                 |
| `retrievalMetadata` | 结构化，含 `searchType`                                                                         | 默认可能 `undefined`                                                                                             |

换 adapter 后面条数、排序、分数口径仍可能对不上。langchain 按 `maxChunks` 截断是 P2，尚未做。

langchain `filterByRequest: false` 时 adapter 不预过滤；runtime 仍强制 filters，会丢不匹配候选并打 `requestFiltersEnforced`。

## 5. LangChain 侧已有实现

- Loader：directory、markdown directory、PDF、Web URL（`HTMLWebBaseLoader`）、Cheerio HTML（URL / 本地文件 / 内联字符串）、通用 loader adapter
- Chunker：recursive character、markdown、token、semantic、**language（代码感知）**、**sentence（句子优先）** + presets
- Chunk transformer：header-aware
- Metadata extractor
- Embeddings adapter
- Retriever：runtime adapter + `BaseRetriever` adapter
- Generator：runtime adapter + chat model adapter

PDF / Web loader 运行时分别依赖 `pdf-parse` 与网络访问；Cheerio loader 解析 HTML 需 `cheerio`（已在 adapters 显式声明）。

## 6. 关键入口

| 路径                 | 职责                                                          |
| -------------------- | ------------------------------------------------------------- |
| `src/openai/shared/` | 官方 SDK 工厂、`OpenAIChatClient`、`createOpenAIChatAdapters` |
| `src/openai/`        | Embedder / Generator / StrategyModel 薄适配                   |
| `src/ollama/`        | 本地模型三条同样角色                                          |
| `src/pgvector/`      | store + runtime retriever                                     |
| `src/langchain/`     | 加载 / 切分 / 检索 / 生成                                     |
| `src/chroma/`        | 只写 store                                                    |

## 7. 测试与脚本

- 单测约 75（改 runtime 契约后需先 `pnpm --filter @monai-ragsdk/runtime build`）
- `pnpm --filter @monai-ragsdk/adapters test`
- demo：`demo:openai-adapters`、`demo:ollama-adapters`、`demo:pgvector-store`、`demo:pgvector-runtime`、`demo:chroma-store`、`demo:langchain-runtime`、`demo:langchain-extensions`

## 8. 已知缺口

- Chroma 查询：按边界不做。
- pgvector 已按 `routeDecision.searchType` 分路；langchain 无双路，不切换。
- Generator **不**消费 `RuntimeGeneratorInput.grounding`（拒答/泛化在 runtime 的 `createGroundingPolicyRuntimeGenerator`）。空 chunks 时厂商实现仍可能调 LLM——这是预期；产品路径应在装配层包包装器。
- 自定义 / demo retriever 若只给裸 candidate、不走 `createIndexingRetrievalCandidate`，后续 filter 与 citation 会缺字段——正确写法见 runtime `/contract`。

## 9. 关联

- [runtime.md](./runtime.md) 契约与装配（§4.2 Retriever 身份与能力）
- [indexing.md](./indexing.md) VectorStore / Embedder / Loader 接口
