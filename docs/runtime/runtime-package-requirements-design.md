# runtime 包需求设计文档

## 目的

本文档用于收敛 `packages/runtime` 的需求边界、职责范围、主流程设计与公开接口方向，作为后续实现 `runtime` 包时的统一设计基线。

文档分工：

- 本文档负责记录职责边界、设计原则与 Phase D 之前仍需保持的约束
- `docs/runtime/runtime-api-usage-guide.md` 负责记录当前已经落地的 API 用法与接入示例
- `docs/context/runtime-package-handoff.md` 负责记录当前包状态、目录与验证现状

本文档重点回答以下问题：

- `runtime` 在整个 MonAI RAG SDK 中负责什么
- `runtime` 不负责什么
- `runtime` 应如何承接完整在线链路
- `runtime` 与 `core`、`indexing`、`adapters` 的边界如何划分
- `runtime` 第一阶段应该实现到什么程度
- 哪些能力应在 `runtime` 中定义抽象，哪些能力应放在 `adapters`

## 适用范围

本文档只约束 `packages/runtime` 的需求设计与职责边界。

当前讨论范围包括：

- 在线查询链路的标准主流程
- 检索前处理、检索、检索后处理、生成四段式运行时编排
- `runtime` 对外暴露的核心接口与默认入口
- `runtime` 与现有 `core`、`indexing`、`adapters` 的协作关系

当前不讨论：

- `indexing` 的离线索引构建细节
- `eval` 的评测数据集、指标与评测执行器设计
- `observability` 的 tracing、metrics 与 hooks 统一方案
- agent、workflow engine、tool calling 等复杂运行时编排
- 多租户状态管理、分布式任务调度与服务端部署形态

## 当前现状

截至当前仓库状态：

- `core` 已完成共享查询契约的最小实现，包括 `Query`、`Chunk`、`RAGResponse`、`Retriever`、`Generator` 与 `RAGPipeline`
- `indexing` 已完成离线索引构建主流程，支持 `load -> transform -> filter -> chunk -> transform-chunk -> metadata -> extract-metadata -> filter-chunk -> embed -> store`
- `adapters` 已完成 LangChain loader / chunker / embedder 适配，以及 Chroma 写入适配
- `adapters` 已完成 LangChain 查询期 retriever / generator 适配，包括 `LangChainRuntimeRetrieverAdapter`、`LangChainRuntimeGeneratorAdapter`、`createLangChainBaseRetrieverRuntimeAdapter` 与 `createLangChainChatModelRuntimeGenerator`
- `runtime` 已完成第一版在线运行时编排 MVP，包括四阶段抽象、统一结果结构、默认件、demo 与 unit test

当前仓库已经具备：

1. 离线建索引主链路
2. 第三方生态的默认 indexing 适配能力
3. LangChain 查询期 retriever / generator 默认适配能力
4. 查询与生成的共享领域契约
5. 在线查询链路的四阶段编排 MVP

当前仍缺失：

1. `runtime` 包内不提供第三方默认 retriever / generator 适配；当前 LangChain 查询期默认适配已归入 `adapters`
2. 更复杂的 rerank / budget trim / hooks
3. 与 `eval`、`observability` 的正式对接

当前 Phase D 第一批已经开始落地：

1. runtime 查询期协议已开始与 indexing Phase D 保留契约对齐
2. `RetrievalRequest` 已开始承载 filter、budget、rerank 与 indexingMode 语义
3. `RetrievalCandidate` 与 `PostRetrievalResult` 已开始显式表达 selection 与 canonical metadata
4. `RuntimeDebugInfo` 已开始补 route、rewrite、threshold 与 budget 级调试信息

因此，当前 `runtime` 的首要目标已经从“补一个空包”切换为“在既有 MVP 基础上继续稳定在线查询编排层与查询期抽象边界”，为后续以 SDK 方式稳定消费索引能力打基础。

这里需要额外强调：

1. 当前 `indexing` 到 `runtime` 的查询协议已具备最小 helper 与根级闭环验证，但尚未等同于完整 Phase D 层级召回或增量索引查询能力
2. 当前 `adapters` 已形成 LangChain、OpenAI 兼容与 Ollama 查询期 retriever / generator 适配；Pinecone 等其余 provider 级预设仍未落地
3. 因此，`runtime` 当前阶段的推进重点仍应是“继续稳定抽象、编排与结果结构”，第三方默认实现继续归入 `adapters`

## 问题背景

当前 `core` 中的 `Retriever` 与 `Generator` 更接近最小契约：

- `Retriever.retrieve(query) => Chunk[]`
- `Generator.generate({ query, chunks }) => string`

这套抽象可以表达非常薄的 RAG pipeline，但不足以完整承载在线运行时链路，原因如下：

1. 无法显式表达检索前处理阶段
2. 无法显式表达检索后处理阶段
3. 无法传递检索参数、路由信息、重写结果与调试上下文
4. 无法稳定承接 rerank、budget trim、context assembly 等运行时步骤
5. 对 SDK 用户而言，扩展点过少，容易把大量逻辑塞进自定义 retriever 或 generator，导致边界退化

因此，`runtime` 不应只是 `Retriever + Generator` 的薄包装，而应成为标准在线链路的编排层。

## 设计目标

`runtime` 的需求目标如下：

1. 明确 `runtime` 是在线查询编排层，而不是第三方适配层
2. 把运行时主流程固定为：
   1. 检索前处理
   2. 检索
   3. 检索后处理
   4. 生成
3. 提供稳定、可替换、可组合的阶段抽象
4. 允许 SDK 用户替换任意阶段，而不是绑定唯一默认工作流
5. 让运行时结果既可供业务消费，也可供调试、观测与后续评测使用
6. 保持与 `core`、`indexing`、`adapters` 的边界清晰，不让 `runtime` 反向吞并其他包职责

## 非目标

本阶段明确不做：

1. 不把 LangChain、Chroma、OpenAI、Pinecone 等第三方实现直接写死在 `runtime`
2. 不在 `runtime` 中提前引入 agent、tool 调用、多分支工作流或复杂编排引擎
3. 不把检索前处理或检索后处理做成高度业务绑定的策略集合
4. 不要求首版就覆盖 hybrid retrieval、multi-query retrieval、router retrieval 等全部高级方案
5. 不要求首版就接通完整 observability 或 eval

## 核心定位

`runtime` 的定位应统一为：

**面向 SDK 的在线 RAG 四阶段编排层。**

它的核心职责不是提供某个具体厂商的完整解决方案，而是：

- 定义标准阶段
- 定义标准输入输出
- 定义标准上下文
- 提供最小默认实现
- 允许用户替换任意阶段

换句话说：

- `runtime` 负责“流程”
- `adapters` 负责“第三方生态实现”
- 业务方负责“策略选择与实际接入”

## 职责边界

## `runtime` 负责什么

`runtime` 负责：

1. 定义在线四阶段主流程
2. 定义各阶段的标准接口与上下文对象
3. 提供 `createRuntime()` 与 `runtime.run()` 一类统一入口
4. 负责运行时错误边界与阶段语义
5. 负责把中间产物组织成统一结果结构
6. 提供少量默认无状态实现，帮助用户最低成本跑通链路

## `runtime` 不负责什么

`runtime` 不负责：

1. 离线索引构建
2. 文件系统加载、文档切分、向量写入
3. 具体第三方 retriever、embeddings、LLM SDK 的适配实现
4. 具体向量库或模型厂商的配置细节
5. 评测体系
6. tracing / metrics 的正式产品化方案

## 与其他 package 的依赖边界

### 1. `runtime` 与 `core`

关系：

- `runtime` 依赖 `core` 的共享模型与错误边界
- `runtime` 不应绕过 `core` 自行重新定义 `Query`、`Chunk`、`RAGResponse` 这类基础模型

约束：

- 如果运行时需要新增跨 package 共用的最小基础模型，应优先判断是否属于 `core`
- 只有运行时专属的上下文、阶段结果与编排期结果类型，才应留在 `runtime`

为避免边界混淆，`runtime` 第一版应明确区分三层输入语义：

1. `RuntimeQueryInput`

- `runtime.run()` 的原始入参
- 属于 `runtime` 自身的运行时输入模型
- 可以承载 query 文本以及运行时 options，但不应直接替代 `core.Query`

2. `Query`

- 继续由 `core` 持有
- 表示跨 package 共享的最小查询模型
- 当前仍保持最小语义，不因运行时编排需求而提前膨胀

3. `RetrievalRequest`

- 属于 `runtime` 内部流转的检索请求模型
- 由检索前处理阶段产出
- 至少应包含：
  - `originalQuery`
  - `effectiveQuery`
  - `topK`
  - `filters`
  - `strategy`
  - `route`
  - `rewriteReason`

当前 Phase D 第一批补充后，`RetrievalRequest` 还可以继续承载：

- `indexingMode`
- `budget`
- `rerank`

这样做的目的是：

1. 保持 `core.Query` 的共享基础语义稳定
2. 让 `runtime` 可以承载 richer query rewrite / routing / retrieval parameter 语义
3. 避免把运行时编排字段错误地下沉到 `core` 或回塞进 `metadata`

### 2. `runtime` 与 `indexing`

关系：

- `indexing` 负责生产可检索索引数据
- `runtime` 负责在线消费这些索引数据

约束：

- `runtime` 不应反向承接离线建库逻辑
- `runtime` 可以依赖 `indexing` 产物所遵循的 metadata 约定，但不应直接侵入 `indexing` 主流程

### 3. `runtime` 与 `adapters`

关系：

- `runtime` 定义检索、生成等阶段的抽象接口
- `adapters` 提供基于 LangChain 或其他生态的默认实现

约束：

- `runtime` 不应直接依赖 LangChain retriever 或具体向量库对象
- 如果要提供默认检索器、默认生成器，其第三方实现应落在 `adapters`

## 标准主流程

`runtime` 的标准在线流程应固定为：

1. 检索前处理
2. 检索
3. 检索后处理
4. 生成

对应的运行时数据流如下：

```text
用户输入
  -> pre-retrieval
  -> retrieval
  -> post-retrieval
  -> generation
  -> runtime result
```

更细的语义可理解为：

```text
原始 query
  -> 规范化 / 改写 / 路由 / 参数决策
  -> 检索候选 chunks
  -> rerank / trim / 去重 / context 组装
  -> 生成 answer
  -> 返回 answer + chunks + debug metadata
```

这条主流程是 `runtime` 的核心基线；后续即便扩展高级能力，也不应破坏这四段式结构。

## 四个阶段的职责定义

### 1. 检索前处理

职责：

1. 规范化 query
2. query rewrite
3. query enrich
4. 路由检索策略
5. 决定基础 retrieval 参数

这一阶段的本质是把“用户原始输入”转换为“可供检索使用的有效查询输入”。

典型产物包括：

- `effectiveQuery`
- `topK`
- `filters`
- `strategy`
- `route`
- `rewriteReason`

### 2. 检索

职责：

1. 基于有效查询执行召回
2. 返回结构化候选 chunk 集合
3. 保留基础 score / route / retriever metadata

这一阶段只负责“召回候选”，不负责：

- 最终排序
- 预算裁剪
- 最终 prompt 上下文拼接

这些行为应属于检索后处理。

### 3. 检索后处理

职责：

1. 去重
2. score threshold 过滤
3. rerank
4. 多样性控制
5. token / length budget trim
6. context 排序
7. 组装生成阶段使用的 prompt context

这是 `runtime` 的核心阶段之一，应明确作为一等公民存在，不能被隐含地塞进 retriever 或 generator。

### 4. 生成

职责：

1. 接收原始 query、有效 query、最终 chunks 与 prompt context
2. 调用生成器输出 answer
3. 返回结构化生成结果

这一阶段只关心：

- 如何基于最终上下文生成回答

它不负责：

- query rewrite
- 检索策略决策
- rerank
- context trim

## 查询期类型补充要求

为了支持 rerank、threshold、route 与调试信息透传，`runtime` 第一版不应把检索阶段输出简单等同于 `Chunk[]`。

建议在 `runtime` 内新增查询期专属类型，例如：

### 1. `RetrievalCandidate`

语义：

- 表示检索阶段返回的候选结果
- 属于查询期临时类型，不属于 `core` 的共享基础模型

建议至少包含：

- `chunk: Chunk`
- `score?: number`
- `route?: string`
- `retrieverMetadata?: Record<string, JsonValue>`

说明：

- `Chunk` 仍然来自 `core`
- `JsonValue` 也继续来自 `core` 的共享 JSON-safe 约束
- 但 score、route、候选来源与 retriever 调试信息不应直接回写到 `Chunk.metadata`
- 否则会把“共享文档片段模型”和“查询期排序候选模型”混为一体

当前 Phase D 第一批已经开始把以下 canonical metadata 提升为显式字段：

- `sourceId`
- `fingerprint`
- `hierarchyPath`
- `parentHierarchyPath`
- `hierarchyDepth`

### 2. `PostRetrievalResult`

语义：

- 表示检索后处理阶段的结构化输出

建议至少包含：

- `chunks: Chunk[]`
- `promptContext?: string`
- `postRetrievalMetadata?: Record<string, JsonValue>`

当前 Phase D 第一批已经新增可选字段：

- `selectedCandidates?: RetrievalCandidate[]`
- `droppedCandidates?: RetrievalCandidate[]`
- `appliedBudget?: RetrievalBudget`
- `appliedScoreThreshold?: number`

说明：

- 第一版 `promptContext` 建议固定为 `string`
- 后续如果要支持 message array 或更复杂 prompt object，再做向后兼容扩展
- MVP 先锁定为字符串，可显著降低 generator 接口歧义

## 建议的核心抽象

`runtime` 第一版应围绕以下四类抽象设计：

### 1. `QueryPreprocessor`

职责：

- 处理检索前处理阶段

建议语义：

- 输入：原始运行时 query input 与 runtime context
- 输出：预处理后的检索输入

### 2. `RuntimeRetriever`

职责：

- 处理检索阶段

建议语义：

- 输入：预处理后的检索输入与 runtime context
- 输出：候选 chunks 与检索调试信息

补充说明：

- `RuntimeRetriever` 是 `runtime` 自己的查询期抽象
- 具体 LangChain retriever adapter 或向量库 retriever adapter 应放在 `adapters`

### 3. `RetrievalPostprocessor`

职责：

- 处理检索后处理阶段

建议语义：

- 输入：query、候选 chunks 与 runtime context
- 输出：最终 chunks、可选 prompt context 与调试信息

### 4. `RuntimeGenerator`

职责：

- 处理生成阶段

建议语义：

- 输入：最终 query、最终 chunks、prompt context 与 runtime context
- 输出：answer 与生成阶段调试信息

## 建议的公共入口

为了保持 SDK 接入体验统一，`runtime` 第一版应提供两个核心入口：

### 1. `createRuntime()`

用途：

- 创建一个可复用的 runtime 实例

其作用不是执行单次请求，而是把四阶段组件组合成一个稳定可复用的对象。

### 2. `runtime.run()`

用途：

- 执行一次完整的在线链路

它应成为 `runtime` 的标准运行入口，统一承接：

- 原始 query input
- 运行时 options
- 中间上下文
- 最终结果产出

## 结果结构要求

作为 SDK，`runtime` 返回值不能只有 `answer`。

第一版建议直接锁定以下结果模型语义：

### 1. 业务层结果

必须包含：

- `answer`
- `chunks`

其中：

- `answer` 表示最终回答
- `chunks` 表示最终实际参与回答的 chunk 集合，而不是原始召回候选全集

### 2. 运行时层结果

建议默认包含：

- `originalQuery`
- `effectiveQuery`
- `retrievalMetadata`
- `postRetrievalMetadata`
- `generationMetadata`

说明：

- 这些字段属于运行时结果主体，而不是可有可无的 debug 附件
- 因为它们会直接影响后续 SDK 调试、问题定位与评测接入

### 3. 调试层结果

建议通过 `runtime.run()` 的 options 显式控制是否返回：

- `debug?: RuntimeDebugInfo`

建议 `RuntimeDebugInfo` 至少包含：

- `timings`
- `retrievedCount`
- `finalChunkCount`
- `promptContext`

当前 Phase D 第一批已经新增：

- `route`
- `rewriteReason`
- `retrievalStrategy`
- `indexingMode`
- `filters`
- `selectedCount`
- `droppedCount`
- `appliedBudget`
- `appliedScoreThreshold`

说明：

- `includeDebug` 默认值建议为 `false`
- 当 `includeDebug = true` 时，返回结构中带上 `debug`
- `debug` 字段一旦暴露，其结构应保持稳定，不应在首版阶段继续模糊化

### 4. 第一版 `promptContext` 约束

第一版建议把 `promptContext` 固定为：

- `string`

原因：

1. 这与当前最小生成链路最匹配
2. 可以先稳定 post-retrieval 与 generator 的对接方式
3. 避免在 MVP 阶段提前引入 message list、tool message 或 provider-specific prompt object

### 5. 建议结果结构语义

可以按以下语义组织：

- `answer`
- `chunks`
- `originalQuery`
- `effectiveQuery`
- `retrievalMetadata`
- `postRetrievalMetadata`
- `generationMetadata`
- `debug?`

其中 `debug` 建议至少包含：

- `timings`
- `retrievedCount`
- `finalChunkCount`
- `promptContext`

这样做的目的不是一次性做“大而全结果对象”，而是提前锁定可扩展的结构化落点，避免后续为了 eval 与 observability 再回头破坏 API。

## 默认实现策略

`runtime` 可以提供默认实现，但应保持最小可运行原则。

建议首版仅提供：

1. `NoopQueryPreprocessor`
   - 不改写 query
   - 负责把原始输入规范化为最小 `RetrievalRequest`
   - 只补默认 retrieval 参数

2. `PassthroughRetrievalPostprocessor`
   - 不 rerank
   - 不 trim
   - 不做额外多样性控制
   - 直接把候选结果中的 `chunk` 透传为最终 `chunks`
   - 可选拼出最简单的 `promptContext`

3. `createDefaultRuntime()`
   - 不是“创建一个不依赖 retriever / generator 的空 runtime”
   - 而是“基于默认 preprocessor / postprocessor，快速组装一个最小可运行 runtime”

因此，`createDefaultRuntime()` 的建议语义应为：

- 调用方必须提供：
  - `retriever`
  - `generator`
- 调用方可选提供：
  - `preprocessor`
  - `postprocessor`

当调用方未显式提供 `preprocessor` 或 `postprocessor` 时：

- 默认使用 `NoopQueryPreprocessor`
- 默认使用 `PassthroughRetrievalPostprocessor`

说明：

- 默认件的目标是帮助用户理解扩展位如何协作
- 默认件不是官方唯一推荐策略
- `runtime` 主包不应内置默认第三方 retriever 或 generator
- 如果未来 `adapters` 提供 `LangChainRetrieverAdapter` 或默认 generator adapter，应由用户显式注入到 `createDefaultRuntime()` 中
- 这样既保留“最小可运行”的接入体验，又不会让 `runtime` 主包错误承担第三方生态绑定职责

## 目录结构建议

建议 `packages/runtime` 目录收敛为：

```text
packages/runtime/
  src/
    index.ts
    types/
    interfaces/
    pipeline/
    defaults/
    errors/
```

各目录职责建议如下：

- `types/`
  - 运行时输入输出
  - 阶段结果
  - 上下文对象
  - options 类型
- `interfaces/`
  - `QueryPreprocessor`
  - `RuntimeRetriever`
  - `RetrievalPostprocessor`
  - `RuntimeGenerator`
- `pipeline/`
  - `create-runtime`
  - `run-runtime`
- `defaults/`
  - `noop-query-preprocessor`
  - `passthrough-postprocessor`
  - `create-default-runtime`
- `errors/`
  - `RuntimeError`
  - 阶段错误类型

## 错误边界要求

`runtime` 应有自己的错误边界，而不是把所有异常都裸抛给调用方。

第一版建议至少具备一个统一的：

- `RuntimeError`

其职责不是替代 `core` 的错误体系，而是为“运行时编排阶段失败”补充统一包装层。

建议约束如下：

### 1. 继承关系

- `RuntimeError` 应继承 `core` 的基础错误类型
- 这样可以保持整个 SDK 错误体系的主干一致
- 同时允许 `runtime` 追加阶段语义与运行时上下文

### 2. 必须保留的信息

`RuntimeError` 至少应包含：

- `stage`
- `originalQuery`
- `effectiveQuery?`
- `cause`

其中阶段语义至少覆盖：

- `pre-retrieval`
- `retrieval`
- `post-retrieval`
- `generation`

### 3. 包装规则

- `runtime` 在四阶段任一环节捕获异常时，应统一包装为 `RuntimeError`
- 如果原始异常已经是 `core` 中的 `RetrievalError`、`GenerationError` 或其他已知错误类型，不应丢弃原始错误语义，而应通过 `cause` 保留
- `runtime` 对调用方暴露的是稳定的 `RuntimeError` 边界，对内部错误来源则通过 `cause` 追溯

### 4. 第一版不强求的内容

第一版可以暂不要求：

- `PreRetrievalError`
- `PostRetrievalError`
- 更细粒度的错误子类树

MVP 先统一使用 `RuntimeError + stage + cause` 即可。

## 与 `adapters` 的协作策略

后续如果需要提供默认外部能力，原则如下：

1. `runtime` 定义抽象接口
2. `adapters` 提供第三方默认实现

典型例子：

- `runtime` 定义 `RuntimeRetriever`
- `adapters` 提供 `LangChainRetrieverAdapter`

不建议的做法：

- 在 `runtime` 内直接 new 某个 LangChain retriever
- 在 `runtime` 内直接绑定 Chroma / Pinecone 客户端
- 在 `runtime` 内直接固化 OpenAI 生成器逻辑

当前阶段还需要额外明确：

- `adapters` 已形成 LangChain 查询期默认实现，但第一阶段 `runtime` 的完成标准仍不依赖具体第三方 adapter
- 与 `adapters` 的默认实现对齐应通过 `RetrievalRequest`、`RetrievalCandidate`、`RuntimeGenerationResult` 等公开契约完成，不应反向影响 `runtime` 第一版抽象边界收敛

## 第一阶段 MVP 范围

`runtime` 第一阶段已按最小闭环落地，不做大而全能力堆叠。

当前已落地范围如下：

1. 四阶段接口与类型定义
2. `createRuntime()` 与 `runtime.run()`
3. 最小默认件
4. runtime 级错误边界
5. runtime 级 demo
6. runtime 级 unit test

当前仍明确不要求：

1. 多路 query rewrite
2. 混合检索
3. reranker provider 预设
4. 答案内 citation 标记解析，或要求 generator 另产出引用
5. 复杂 hooks 机制
6. 与 eval / observability 的正式对接

## 验证要求

`runtime` 当前实现已经补齐以下验证：

### 1. unit test

覆盖：

- 四阶段最小协作路径
- 默认件行为
- 阶段错误语义
- 中间结果透传

### 2. demo

覆盖：

- 最小 runtime 组装
- 自定义 preprocessor / retriever / postprocessor / generator 组合

### 3. 根级验证

当前已接入：

- `pnpm --filter @monai-ragsdk/runtime build`
- `pnpm --filter @monai-ragsdk/runtime test`

当前还已经补充：

- `pnpm --filter @monai-ragsdk/runtime demo`
- `pnpm --filter @monai-ragsdk/runtime demo:custom`

根级脚本也已纳入：

- `pnpm test`
- `pnpm test:runtime`

## 分阶段实施建议

### Phase A：补抽象与类型

实现：

1. `types/`
2. `interfaces/`
3. `errors/`

目标：

- 先把公开 API 边界定住

### Phase B：补 pipeline 与默认件

实现：

1. `createRuntime()`
2. `runtime.run()`
3. `NoopQueryPreprocessor`
4. `PassthroughRetrievalPostprocessor`

目标：

- 跑通最小运行时闭环

### Phase C：补 demo 与 test

实现：

1. runtime demo
2. runtime unit test

目标：

- 证明四阶段抽象可稳定协作

### Phase D：再考虑与 `adapters` 的默认实现对齐

实现方向：

1. LangChain retriever adapter
2. 可能的默认 generator adapter

目标：

- 让 `runtime` 抽象真正接上第三方生态，但不污染 `runtime` 主包

## 最终结论

`runtime` 不应被设计成一个薄的“查询函数集合”，而应被设计成：

**面向 SDK 的在线 RAG 四阶段编排层。**

这意味着：

1. 它必须正式承接完整在线流程：
   1. 检索前处理
   2. 检索
   3. 检索后处理
   4. 生成
2. 它必须优先稳定抽象边界，而不是抢先写死某个生态实现
3. 它必须为默认件、调试信息、后续评测与可观测性保留结构化落点
4. 它应与 `core`、`indexing`、`adapters` 保持清晰边界，而不是吞并其他 package 的职责

后续如进入实际实现阶段，应以本文档作为 `runtime` 的第一版需求基线。
