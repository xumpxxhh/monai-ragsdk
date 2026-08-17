# indexing 扩展架构设计草案

## 当前状态说明

本文档最初用于指导 `indexing` 从旧版 MVP 演进到扩展骨架。

截至当前仓库状态：

- Phase A 已完成：`ChunkTransformer`、`ChunkFilter`、`MetadataExtractor` 与相关上下文、options、pipeline 阶段已经落地。
- Phase B 已完成：`ContentCleanupTransformer`、`ContextualHeaderTransformer`、`HashDedupChunkFilter`、`BasicMetadataExtractor` 已落地。
- Phase C 已完成：`adapters` 已补 `LangChainSemanticChunkerAdapter`、`LangChainHeaderAwareChunkTransformer`、`LangChainDocumentMetadataExtractor`。
- Phase D 已完成最小契约预留：`IndexingMode`、`sourceIdResolver`、`fingerprintResolver`、`VectorStoreWriteContext`、可选 `deleteByFilter()` 与层级 metadata 已落地。

因此，本文档现在更适合作为“为什么这样设计”的架构说明，而不是未落地的纯前瞻计划。当前实现现状以 `packages/indexing/README.md`、`docs/context/indexing-package-handoff.md` 与 `docs/indexing/phase-d-contract-reservations.md` 为准。

## 目的

本文档用于把当前 `packages/indexing` 的 MVP 设计，收敛为一版适合继续演进的正式扩展草案。

本文档不直接要求一次性实现 8 个技术名词本身，而是先明确：

- `indexing` 下一阶段应该补哪些扩展位
- 8 个技术点分别应该落到哪个扩展位
- 哪些能力属于 `indexing`
- 哪些能力应继续放在 `adapters`
- 后续实现应遵循怎样的阶段顺序

## 适用范围

本文档只约束 `packages/indexing` 与 `packages/adapters` 在离线索引构建阶段的职责划分。

当前不讨论：

- `runtime` 的正式检索协议
- `eval` 的评测设计
- `observability` 的统一 tracing / metrics 方案
- 并发调度、分布式任务、工作流编排

## 当前现状

当前 `indexing` 已具备一条最小可运行且向后兼容的串行流程：

1. `load`
2. `transform`
3. `filter`
4. `chunk`
5. `transform-chunk`
6. `metadata`
7. `extract-metadata`
8. `filter-chunk`
9. `embed`
10. `store`

当前主要实现包括：

- `Loader`
- `Chunker`
- `DocumentTransformer`
- `ChunkTransformer`
- `ChunkFilter`
- `MetadataExtractor`
- `Embedder`
- `VectorStore`
- `SimpleChunker`
- `ContentCleanupTransformer`
- `ContextualHeaderTransformer`
- `HashDedupChunkFilter`
- `BasicMetadataExtractor`
- `MockEmbedder`
- `MemoryVectorStore`
- `IndexingError`
- `runIndexing`

当前设计已经证明主流程可跑通，并且核心扩展位已经补齐；后续挑战主要从“扩展位不足”转向“如何稳定这些公开契约的协作方式”。

1. `DocumentTransformer` 只能表达 `Document -> Document`，无法自然承接 chunk 级增强。
2. `metadataBuilder` 只能补 metadata，无法承接结构化元数据抽取、chunk 级增强或去重策略。
3. 许多本应独立演进的能力，未来容易被硬塞进 `chunker` 或 `metadataBuilder`。
4. 当前流程对 `incremental`、层级索引和 chunk 级治理缺少明确保留位。

## 设计目标

下一阶段的设计目标如下：

1. 保持 `runIndexing` 仍是主入口，不推翻现有 MVP 流程。
2. 在不破坏旧用法的前提下，为 chunk 级增强、过滤、元数据抽取补齐正式扩展位。
3. 让 8 个技术名词可以被清晰映射到 `indexing` 的扩展点，而不是散落成临时实现。
4. 保持 `indexing` 定义抽象、`adapters` 承接第三方生态绑定实现的职责边界。
5. 为未来的 `hierarchical indexing` 与 `incremental indexing` 保留演进空间，但本阶段不做真完成版。

## 非目标

本阶段明确不做：

1. 不在 `indexing` 内直接实现复杂语义切分算法。
2. 不在 `indexing` 内直接绑定 LangChain、Chroma 之外的新第三方运行时对象。
3. 不为了支持高级能力而立刻重写 `core` 的共享模型。
4. 不提前引入并发、重试、增量状态机或复杂任务编排。

## 设计原则

### 1. 先补骨架，再挂能力

8 个技术名词中，只有一部分适合立即落到当前结构里。

这一轮优先做的是“让能力有地方挂”，而不是“把所有能力都做完”。

### 2. `indexing` 负责流程抽象，`adapters` 负责第三方生态集成

判断原则如下：

- 与 SDK 主流程强绑定、且不依赖第三方生态的抽象，放 `indexing`
- 与 LangChain、Chroma 或其他外部库强绑定的实现，放 `adapters`

### 3. 默认实现保持最小可运行

`indexing` 可以提供少量默认实现，但目标应是：

- 帮助用户理解扩展点如何工作
- 支撑 demo 与 unit test
- 不把复杂算法和外部依赖提前写死到主包

### 4. 保持向后兼容优先

下一阶段扩展应满足：

- 现有 `runIndexing` 用法不破
- 新增配置全部可选
- 旧的 `metadataBuilder` 先兼容保留，不立即强制迁移

## 建议新增的核心扩展位

### 1. `ChunkTransformer`

职责：对 chunk 进行增强或改写。

典型用途：

- `Contextual Headers`
- 部分 `Document Augmentation`
- chunk 内容标准化
- 在 chunk 上补充上下文片段

建议目录：

- `packages/indexing/src/chunk-transformers/`

建议接口方向：

- 输入：chunk 以及其来源 document 的上下文
- 输出：增强后的 chunk

### 2. `ChunkFilter`

职责：在 chunk 阶段执行过滤、去重和清洗后的淘汰策略。

典型用途：

- `去重与清洗` 中的去重部分
- 低质量 chunk 过滤
- 重复 header / 空白 chunk 过滤

建议目录：

- `packages/indexing/src/filters/`

建议接口方向：

- 输入：完整 chunk 上下文
- 输出：是否保留该 chunk

### 3. `MetadataExtractor`

职责：把 document / chunk 上下文转成正式 metadata，而不是只做简单 merge。

典型用途：

- `元数据抽取`
- 路径、标题、层级路径、来源标识抽取
- 为后续 `hierarchical indexing` 与 `incremental indexing` 打基础

建议目录：

- `packages/indexing/src/metadata/`

兼容策略：

- 继续保留现有 `metadataBuilder`
- 新流程优先支持 `MetadataExtractor`
- 若用户只提供 `metadataBuilder`，内部做兼容桥接

### 4. `IndexingMode`

职责：为未来增量索引保留模式位。

建议本阶段只定义最小类型，不承诺完整行为。

建议方向：

- `full`
- `incremental`

说明：

`IndexingMode` 只是保留位，不应被误解为增量能力已经完成。真正的前置仍是 source identity、fingerprint 与 store 删除契约。

## 建议的主流程升级

当前实现已经在不推翻现有 `runIndexing` 的前提下，把主流程扩展为：

1. `load`
2. `transform`
3. `filter`
4. `chunk`
5. `transform-chunk`
6. `metadata`
7. `extract-metadata`
8. `filter-chunk`
9. `embed`
10. `store`

这样调整的原因：

1. chunk 级增强应有独立阶段，而不是挤在 `chunker` 内。
2. metadata 抽取应成为正式阶段，而不是一个附属回调。
3. 旧版 `metadataBuilder` 仍需兼容，因此在 `extract-metadata` 之前保留独立的 `metadata` 阶段更稳妥。
4. 很多 chunk 过滤逻辑依赖 metadata 抽取结果，因此把 `filter-chunk` 放在 `extract-metadata` 之后是合理的。

## 建议补充的上下文信息

当前 `IndexingContext` 只有 `documentId` 与 `stage`，对后续扩展偏弱。

建议后续逐步补充：

- `documentId`
- `chunkId`
- `stage`
- `mode`
- `sourceId`
- `fingerprint`

当前 `IndexingContext`、chunk 级上下文与 store 写入上下文已经补齐这些字段中的大部分；后续新增接口仍应优先基于上下文对象扩展，而不是不断追加零散参数。

## 8 个技术点与扩展位映射

### 第一优先级

#### 1. `Contextual Headers`

建议归属：`ChunkTransformer`

原因：

- 本质是为 chunk 注入额外上下文
- 更适合在 chunk 已形成后补 header path、section path 或父标题信息

建议默认件：

- `ContextualHeaderTransformer`

#### 2. `Document Augmentation`

建议归属：优先放 `DocumentTransformer`，必要时后续引入独立 expander 抽象。

原因：

- 第一版通常只是改写文档内容或附加额外上下文
- 暂时不需要为多文档派生能力重构主流程

建议默认件：

- `DocumentAugmentationTransformer`

注意：

如果未来要支持一份文档派生多个索引单元，应新增独立抽象，而不是继续把复杂行为硬塞进 `DocumentTransformer`。

#### 3. `元数据抽取`

建议归属：`MetadataExtractor`

建议默认件：

- `BasicMetadataExtractor`
- `PathMetadataExtractor`
- `TitleMetadataExtractor`

原因：

- 这类能力已经超出简单 metadata merge
- 需要被提升为正式扩展点

#### 4. `去重与清洗`

建议拆分：

- 清洗放 `DocumentTransformer`
- 去重放 `ChunkFilter`

建议默认件：

- `ContentCleanupTransformer`
- `HashDedupChunkFilter`

### 第二优先级

#### 5. `Recursive Chunking`

建议归属：`Chunker`

说明：

- 这一能力已经天然属于 chunker 家族
- 第一版优先复用 `adapters` 中已有的 LangChain recursive splitter 适配能力

#### 6. `Semantic Chunking`

建议归属：`Chunker`

说明：

- 不建议先在 `indexing` 中自研算法
- 第一版优先通过 `adapters` 提供外部生态适配器

### 第三优先级

#### 7. `Hierarchical Indexing`

建议归属：先落到 metadata 设计，再考虑更深层协议。

本阶段建议：

- 先把层级路径、父标题、section path 写进 metadata
- 不立即改造 `core` 共享模型

说明：

这能先支持基础检索增强，但不等同于完整的层级索引模型。

#### 8. `增量更新`

建议归属：先做契约预留，不做完整实现。

本阶段建议：

- 增加 `IndexingMode` 保留位
- 设计 `sourceId` / `fingerprint` 等字段预留
- 后续再补 `delete stale` 与 store 对应契约

说明：

现有 `VectorStore` 只有 `upsert`，因此增量更新的真正落地仍依赖 store 契约扩展。

## `indexing` 与 `adapters` 的职责边界

### 应放在 `indexing` 的内容

- `ChunkTransformer`、`ChunkFilter`、`MetadataExtractor` 等抽象接口
- `runIndexing` 的阶段编排
- 与第三方无关的最小默认实现
- 与阶段语义绑定的错误模型

### 应放在 `adapters` 的内容

- LangChain 语义切分适配器
- LangChain recursive splitter 适配器
- 与第三方 loader / splitter / embeddings / vector store 直接绑定的封装
- 依赖第三方返回结构的 metadata 适配逻辑

### 不应发生的情况

- 不要把具体文件系统、远程存储或第三方对象的细节回写到 `indexing`
- 不要让 `adapters` 反过来定义 `indexing` 的主流程语义

## 推荐的默认实现落地顺序

### 阶段 A：骨架升级

目标：先补扩展位，不急着实现复杂算法。

建议动作：

1. 扩展 `IndexingOptions`
2. 扩展 `IndexingContext`
3. 在 `runIndexing` 中加入 chunk transform / metadata extract / chunk filter 阶段
4. 新增目录：
   - `chunk-transformers/`
   - `filters/`
   - `metadata/`
5. 保持旧的 `metadataBuilder` 兼容

验收标准：

- 现有调用方式不破
- 新扩展位全部可选
- 已有测试继续通过

### 阶段 B：落 4 个高收益默认件

建议优先实现：

1. `ContentCleanupTransformer`
2. `ContextualHeaderTransformer`
3. `HashDedupChunkFilter`
4. `BasicMetadataExtractor`

验收标准：

- markdown 文档切块后可保留 header path 或等价上下文信息
- 重复 chunk 可以被过滤
- metadata 抽取不再只依赖单一回调

### 阶段 C：补 `adapters` 默认实现

当前已落地方向：

1. `LangChainSemanticChunkerAdapter`
2. header-aware 的 chunk transformer 适配器或等价实现
3. 基于 LangChain loader 输出的 metadata extractor 适配器

验收标准：

- `adapters` 仍只依赖 `indexing` 的抽象接口
- 第三方实现不回流到 `indexing`

### 阶段 D：设计高级能力

当前已完成的只是此阶段的最小契约预留，尚未进入完整行为实现：

1. `Hierarchical Indexing`
2. `Incremental Indexing`

建议策略：

- `Hierarchical Indexing` 第一版先落 metadata，不先改共享模型
- `Incremental Indexing` 第一版先支持 `source fingerprint + upsert + delete stale`

## API 演进建议

### 1. `metadataBuilder` 先兼容保留

不建议在阶段 A 直接删除或替换 `metadataBuilder`。

推荐策略：

- 新增 `metadataExtractors`
- 若用户未提供 extractor，则沿用现有 `metadataBuilder`
- 等默认实现和文档稳定后，再考虑标记 `metadataBuilder` 为过渡接口

### 2. `DocumentTransformer` 暂不强改，但需承认其未来上限

当前 `DocumentTransformer` 可以继续保留，用于：

- 文本清洗
- 内容增强
- 前置规范化

但如果后续需要“一份文档派生多个索引单元”，应新增独立抽象，而不是继续扩大 `DocumentTransformer` 职责。

### 3. `IndexingMode` 只做保留位，不承诺完整语义

本阶段引入 `IndexingMode` 的价值在于：

- 给未来 option 结构预留位置
- 避免后续再做破坏式 API 改动

但它不代表增量更新已经具备完整行为。

## 风险与注意事项

### 1. 不要把所有能力都折叠进 `Chunker`

如果没有 `ChunkTransformer`、`ChunkFilter`、`MetadataExtractor`，后续很多能力都会被错误地塞进 `Chunker`，导致职责膨胀。

### 2. 不要过早为高级能力改造共享模型

`Hierarchical Indexing` 与 `Incremental Indexing` 都会带来更深的协议演进，但当前阶段优先保留在 metadata 与 option 层即可。

### 3. 不要让默认实现过度绑定 markdown 细节

默认件可以先对 markdown 友好，但 `indexing` 抽象本身不应被限定为 markdown-only。

## 结论

当前最优先的工作，不是直接实现 `Semantic Chunking`，而是先补齐以下三个扩展位：

1. `ChunkTransformer`
2. `ChunkFilter`
3. `MetadataExtractor`

只有先把这三个扩展位补齐，后续 8 个技术点才能以干净的方式落进 SDK，而不会持续把临时逻辑挤进 `chunker`、`metadataBuilder` 或 adapter 细节中。
