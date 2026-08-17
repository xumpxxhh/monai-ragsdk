# LangChain 默认 Retriever 适配需求文档

## 背景

当前 `@monai-ragsdk/runtime` 已经定义了在线查询链路的四阶段结构：

1. `pre-retrieval`
2. `retrieval`
3. `post-retrieval`
4. `generation`

其中检索阶段由 `RuntimeRetriever` 接口承载。`runtime` 只定义检索协议，不直接绑定具体第三方检索框架。

当前 `@monai-ragsdk/adapters` 已经提供 LangChain 相关检索适配能力：

- `LangChainRuntimeRetrieverAdapter`
- `createLangChainBaseRetrieverRuntimeAdapter`

这些实现已经可以把 LangChain 风格 retriever 接入 `RuntimeRetriever`，但当前仍偏协议适配层。后续需要继续整理和稳定“LangChain 默认 retriever 适配”的需求边界，使开发者可以用更少配置把 LangChain retriever 接入 runtime 查询链路。

## 目标

在 `@monai-ragsdk/adapters` 中提供稳定、可测试、可扩展的 LangChain 默认 retriever 适配能力。

目标不是在 adapter 中实现检索前策略，也不是替代 `runtime` 的 `QueryPreprocessor`，而是：

- 消费 `runtime` 产出的 `RetrievalRequest`
- 调用 LangChain retriever
- 把 LangChain 返回结果转换成 `RuntimeRetrievalResult`
- 复用 runtime 侧已有的 filters、candidate、metadata 语义
- 给开发者提供合理默认行为和必要自定义入口

## 非目标

本需求不包括以下内容：

- 不实现新的 `QueryPreprocessor`
- 不在 adapter 中做 query rewrite 决策
- 不实现复杂 rerank 逻辑
- 不实现 post-retrieval budget trim
- 不新增 OpenAI / Pinecone / Chroma 查询侧强绑定实现
- 不修改 `@monai-ragsdk/runtime` 的四阶段结构
- 不把 LangChain 类型泄漏到 `@monai-ragsdk/runtime`

## 当前相关代码

主要关注以下文件：

- `packages/adapters/src/langchain/retrievers/langchain-runtime-retriever-adapter.ts`
- `packages/adapters/src/langchain/retrievers/langchain-base-retriever-runtime-adapter.ts`
- `packages/adapters/src/langchain/retrievers/index.ts`
- `packages/adapters/src/langchain/index.ts`
- `packages/adapters/src/index.ts`
- `packages/adapters/__tests__/langchain-runtime-retriever-adapter.spec.ts`
- `packages/adapters/__tests__/langchain-base-retriever-runtime-adapter.spec.ts`
- `packages/adapters/demo/langchain-runtime.ts`

需要对齐的 runtime 文件：

- `packages/runtime/src/interfaces/runtime-retriever.ts`
- `packages/runtime/src/types/retrieval-request.ts`
- `packages/runtime/src/types/retrieval-candidate.ts`
- `packages/runtime/src/types/runtime-retrieval-result.ts`
- `packages/runtime/src/indexing/query-protocol.ts`

## 设计原则

1. `runtime` 负责定义协议，`adapters` 负责第三方生态适配。
2. 默认行为应足够直接，不隐藏复杂检索策略。
3. 自定义入口应覆盖真实 LangChain 项目中的常见差异。
4. filter 语义优先复用 runtime 已有实现。
5. 适配器输出必须是 SDK 标准的 `RuntimeRetrievalResult`。
6. 不要把第三方对象原样透传给 runtime 标准类型，第三方细节应进入 `retrievalMetadata` 或 candidate metadata。

## 需求 1：通用 LangChain Retriever Adapter

### API

保留并稳定：

```ts
class LangChainRuntimeRetrieverAdapter<TInput, TResult>
  implements RuntimeRetriever
```

构造参数应支持：

```ts
type LangChainRuntimeRetrieverOptions<TInput, TResult> = {
  retriever: {
    invoke(input: TInput): Promise<TResult>;
  };
  idPrefix?: string;
  mapRequest?: (
    request: RetrievalRequest,
    context: RuntimeContext,
  ) => TInput | Promise<TInput>;
  extractDocuments?: (
    result: TResult,
    request: RetrievalRequest,
    context: RuntimeContext,
  ) => LangChainRuntimeRetrieverDocumentLike[] | Promise<LangChainRuntimeRetrieverDocumentLike[]>;
  extractScore?: (
    document: LangChainRuntimeRetrieverDocumentLike,
    index: number,
    request: RetrievalRequest,
  ) => number | undefined | Promise<number | undefined>;
  mapCandidate?: (input: {
    document: LangChainRuntimeRetrieverDocumentLike;
    index: number;
    result: TResult;
    request: RetrievalRequest;
    context: RuntimeContext;
  }) => RetrievalCandidate | Promise<RetrievalCandidate>;
  buildRetrievalMetadata?: (input: {
    result: TResult;
    request: RetrievalRequest;
    context: RuntimeContext;
    candidates: RetrievalCandidate[];
    filteredCandidates: RetrievalCandidate[];
  }) => Record<string, JsonValue> | undefined | Promise<Record<string, JsonValue> | undefined>;
  filterByRequest?: boolean;
};
```

### 默认行为

当开发者不传自定义函数时：

- 使用 `request.effectiveQuery.query` 作为 retriever 输入
- 调用 `retriever.invoke(input)`
- 期望返回结果是 document-like 数组
- document-like 对象至少包含 `pageContent`
- `document.id` 映射为 `chunk.id`
- 无 `document.id` 时使用 `${idPrefix}-${index}`
- `document.pageContent` 映射为 `chunk.content`
- `document.metadata` 归一化后映射为 `chunk.metadata`
- `document.score` 或 `document.metadata.score` 映射为 `candidate.score`
- `request.route` 映射为 `candidate.route`
- `request.strategy` 映射为 `candidate.strategy`
- 默认使用 `filterRetrievalCandidatesByIndexingFilters(candidates, request.filters)` 过滤候选

### 错误行为

如果默认 `extractDocuments` 无法从返回值中解析 document 数组，应抛出明确错误，提示开发者提供 `extractDocuments()`。

如果 document 缺少合法 `pageContent`，默认行为可以跳过该 document，但不应生成空 content candidate。

## 需求 2：LangChain BaseRetriever Preset

### API

保留并稳定：

```ts
function createLangChainBaseRetrieverRuntimeAdapter(options): RuntimeRetriever
```

参数应支持：

```ts
type CreateLangChainBaseRetrieverRuntimeAdapterOptions<Metadata> = {
  retriever: BaseRetriever<Metadata>;
  idPrefix?: string;
  mapQuery?: (
    request: RetrievalRequest,
    context: RuntimeContext,
  ) => string | Promise<string>;
  mapRunnableConfig?: (
    request: RetrievalRequest,
    context: RuntimeContext,
  ) => RunnableConfig | undefined | Promise<RunnableConfig | undefined>;
  extractScore?: (
    document: DocumentInterface<Metadata>,
    index: number,
    request: RetrievalRequest,
  ) => number | undefined | Promise<number | undefined>;
  buildRetrievalMetadata?: LangChainRuntimeRetrieverMetadataBuilder<DocumentInterface<Metadata>[]>;
  filterByRequest?: boolean;
};
```

### 默认行为

- 默认 query 使用 `request.effectiveQuery.query`
- 默认调用 `retriever.invoke(query, runnableConfig)`
- 默认 runnable config 为 `undefined`
- 默认 score 从 `document.metadata.score` 读取
- 默认复用通用 adapter 的 document 转 candidate 行为
- 默认复用 request filters

### 自定义行为

必须支持：

- 通过 `mapQuery()` 改写传入 LangChain retriever 的 query
- 通过 `mapRunnableConfig()` 把 `route`、`strategy`、`metadata` 等 runtime 请求信息映射到 LangChain tags、metadata、callbacks 等配置
- 通过 `extractScore()` 适配不同 retriever 的分数字段
- 通过 `buildRetrievalMetadata()` 暴露 provider / retriever 级调试信息
- 通过 `filterByRequest: false` 关闭 adapter 层过滤

## 需求 3：检索结果 Candidate 映射

adapter 输出的每个候选必须尽量对齐 runtime 的标准 `RetrievalCandidate`。

默认 candidate 字段：

```ts
{
  chunk: {
    id: string;
    content: string;
    metadata?: Record<string, JsonValue>;
  };
  score?: number;
  route?: string;
  strategy?: string;
  sourceId?: string;
  fingerprint?: string;
  hierarchyPath?: string;
  parentHierarchyPath?: string;
  hierarchyDepth?: number;
  matchedFilters?: string[];
  retrieverMetadata?: Record<string, JsonValue>;
}
```

其中以下字段应通过 runtime helper 解析：

- `sourceId`
- `fingerprint`
- `hierarchyPath`
- `parentHierarchyPath`
- `hierarchyDepth`
- `matchedFilters`

优先复用：

```ts
createIndexingRetrievalCandidate()
filterRetrievalCandidatesByIndexingFilters()
```

## 需求 4：Filter 行为

默认情况下，adapter 必须应用 `request.filters`。

原因：

- 很多 LangChain retriever 不原生支持当前 SDK 的 indexing metadata filter 语义
- adapter 层过滤能保证 runtime filters 在不同第三方 retriever 上有一致最低行为

默认支持的 filter：

- `sourceIds`
- `fingerprints`
- `hierarchyPaths`
- `parentHierarchyPaths`
- `minHierarchyDepth`
- `maxHierarchyDepth`
- `metadata`

可通过 `filterByRequest: false` 关闭。

关闭后，adapter 应直接返回未过滤 candidates。

## 需求 5：Retrieval Metadata

adapter 应支持输出 `retrievalMetadata`。

默认不强制生成 metadata，避免引入不稳定字段。

开发者可通过 `buildRetrievalMetadata()` 自定义，例如：

```ts
{
  provider: "langchain",
  retrieverType: "BaseRetriever",
  originalCandidateCount: candidates.length,
  finalCandidateCount: filteredCandidates.length
}
```

注意：

- `retrievalMetadata` 必须是 JSON-compatible object
- 不要放入 LangChain 原始 class instance
- 不要放入函数、Symbol、循环引用对象

## 需求 6：导出要求

以下能力必须从包入口正常导出：

- `LangChainRuntimeRetrieverAdapter`
- `createLangChainBaseRetrieverRuntimeAdapter`
- 相关 options 类型
- 相关 document-like 类型
- 相关 mapper 类型

需要检查：

- `packages/adapters/src/langchain/retrievers/index.ts`
- `packages/adapters/src/langchain/index.ts`
- `packages/adapters/src/index.ts`

## 需求 7：测试要求

需要覆盖以下测试场景。

### 通用 adapter 测试

1. 默认使用 `request.effectiveQuery.query` 调用 `retriever.invoke()`
2. LangChain document-like 结果能映射成 `RetrievalCandidate`
3. `document.score` 能映射成 `candidate.score`
4. `document.metadata.score` 能映射成 `candidate.score`
5. `request.route` 和 `request.strategy` 能进入 candidate
6. `request.filters` 默认生效
7. `matchedFilters` 正确记录命中的 filter
8. `filterByRequest: false` 时不过滤候选
9. `mapRequest()` 可以自定义 retriever 输入
10. `extractDocuments()` 可以适配非数组返回值
11. `extractScore()` 可以自定义分数
12. `mapCandidate()` 可以完全接管 candidate 生成
13. `buildRetrievalMetadata()` 能拿到过滤前和过滤后的 candidates
14. 默认无法解析非数组结果时抛出明确错误

### BaseRetriever preset 测试

1. 默认调用 `BaseRetriever.invoke(request.effectiveQuery.query, undefined)`
2. `mapQuery()` 能覆盖 query
3. `mapRunnableConfig()` 能传入 tags / metadata
4. 默认从 `document.metadata.score` 提取分数
5. `extractScore()` 能覆盖默认分数提取
6. 默认应用 request filters
7. `filterByRequest: false` 能关闭过滤
8. `buildRetrievalMetadata()` 能返回检索元信息

### 跨包行为测试

至少保留或补充一个 runtime + adapters 查询链路场景：

- 使用 `NoopQueryPreprocessor` 生成带 filters / route / strategy 的 request
- 使用 LangChain BaseRetriever preset 检索
- 默认 adapter 应用 filters
- runtime postprocessor 继续应用 score threshold / budget
- generator 收到过滤和裁剪后的 chunks
- `includeDebug: true` 时能看到 route、filters、selectedCount、droppedCount 等信息

## 需求 8：Demo 要求

保留并更新：

- `packages/adapters/demo/langchain-runtime.ts`

demo 应展示：

- 使用 `NoopQueryPreprocessor` 注入 filters、rerank、budget、route、strategy
- 使用 `createLangChainBaseRetrieverRuntimeAdapter()` 接入 LangChain retriever
- 使用 `createLangChainChatModelRuntimeGenerator()` 接入 LangChain chat model
- 最终 `runtime.run()` 可以返回 answer、chunks、debug

## 验收标准

完成后应满足：

1. `pnpm --filter @monai-ragsdk/adapters test` 通过
2. `pnpm --filter @monai-ragsdk/runtime test` 通过
3. `pnpm test` 通过
4. `pnpm run test:integration` 通过
5. `pnpm run smoke` 通过
6. `LangChainRuntimeRetrieverAdapter` 能独立适配任意 LangChain 风格 `invoke()` retriever
7. `createLangChainBaseRetrieverRuntimeAdapter()` 能直接适配 LangChain `BaseRetriever`
8. adapter 默认消费 `request.effectiveQuery.query`
9. adapter 默认应用 `request.filters`
10. adapter 不新增检索前策略，不破坏 `QueryPreprocessor` 的职责边界

## 实现注意事项

- 不要修改 `@monai-ragsdk/runtime` 的接口，除非确有必要。
- 如果必须修改 runtime 类型，需要同步更新 runtime 测试与文档。
- 不要把 LangChain 依赖加到 `runtime` 包。
- 不要在 `src/` 中生成 `.js`、`.d.ts` 等构建产物。
- 新增公开导出时必须同步更新 exports 测试。
- 文档保持中文。
- 优先复用已有 helper，不重复实现 filter 匹配逻辑。

