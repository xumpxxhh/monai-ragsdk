# 面向开发者的推荐接入方式

## 目的

本文档用于说明当前 MonAI RAG SDK 在 `indexing` 与 `adapters` 层的推荐接入方式，帮助业务开发者快速判断：

- 什么情况下只需要最小接入
- 什么情况下可以直接使用仓库默认提供的 LangChain loader / chunker
- 什么情况下应该走默认栈：OpenAI 兼容 embedding / chat + pgvector
- 什么情况下可以使用仓库提供的 Chroma 写入 adapter
- 什么情况下应自行接入外部 embedding 与 vector store

## 先看职责边界

当前包边界建议按下面理解：

- `@monai-ragsdk/core`：承载共享模型与基础契约
- `@monai-ragsdk/indexing`：承载离线索引主流程编排
- `@monai-ragsdk/adapters`：承载第三方生态适配实现

其中：

- `indexing` 负责编排 `load -> transform -> filter -> chunk -> transform-chunk -> metadata -> extract-metadata -> filter-chunk -> embed -> store`
- `indexing` 依赖的是抽象接口，而不是某个具体厂商实现
- 开发者可以完全自行提供 `Loader`、`Chunker`、`Embedder`、`VectorStore`
- 当前仓库默认提供的第三方策略主要在 `adapters` 中，当前已包含 LangChain 方向的 loader / chunker / metadata / chunk transformer / embedder 适配，OpenAI 兼容 embedding / chat，以及 pgvector 读写与 Chroma 写入侧 store adapter

可以把当前设计理解为：

`indexing` 负责流程，`adapters` 负责默认外部适配，业务方始终保留替换具体实现的权利。

## 推荐选择

如果你只是想快速跑通流程，优先选择“最小接入方案”。

如果你已经接受 LangChain 作为文档加载与切分层，优先选择“默认 LangChain loader / chunker 方案”。

如果你要把索引结果写入真实向量库并问答，优先选择“默认 OpenAI 兼容 embedding / chat + pgvector 方案”。

如果你只需要把向量写入 Chroma，再选择“可选 Chroma store 方案”。

如果你已经有自己的模型服务、向量数据库或基础设施，优先选择“完全自定义外部 embedder / vector store 方案”。

## 方案一：最小接入方案

### 适用场景

- 你想先跑通 indexing 主流程
- 你还没有接真实 embedding 服务和向量数据库
- 你希望先在本地验证文档处理链路是否正确

### 推荐组合

- `Loader`：业务方自己提供一个最简单的实现
- `Chunker`：使用 `@monai-ragsdk/indexing` 内置的 `SimpleChunker`
- `Embedder`：使用 `@monai-ragsdk/indexing` 内置的 `MockEmbedder`
- `VectorStore`：使用 `@monai-ragsdk/indexing` 内置的 `MemoryVectorStore`

### 示例

```ts
import {
  MemoryVectorStore,
  MockEmbedder,
  SimpleChunker,
  runIndexing,
  type Loader,
} from "@monai-ragsdk/indexing";

const loader: Loader = {
  async load() {
    return [
      {
        id: "doc-1",
        content: "MonAI RAG SDK 最小接入示例。",
        metadata: {
          source: "manual",
        },
      },
    ];
  },
};

const store = new MemoryVectorStore();

const result = await runIndexing({
  loader,
  chunker: new SimpleChunker({
    chunkSize: 200,
    overlap: 20,
  }),
  embedder: new MockEmbedder({ dimension: 8 }),
  store,
});

console.log(result);
console.log(store.getAll());
```

### 说明

- 这是最适合本地验证的方案
- 该方案不依赖 LangChain，也不依赖任何外部模型或向量数据库
- 它的目标不是上线，而是最低成本验证“流程”和“数据形态”

## 方案二：使用默认 LangChain loader / chunker 的方案

### 适用场景

- 你希望直接复用 LangChain 的文档加载和文档切分能力
- 你接受当前 SDK 把第三方策略放到 `@monai-ragsdk/adapters`
- 你希望在不自己写 loader / chunker 的前提下尽快落地

### 当前默认能力

当前 `@monai-ragsdk/adapters` 已提供：

- `LangChainLoaderAdapter`
- `LangChainDirectoryLoaderAdapter`
- `LangChainMarkdownDirectoryLoader`
- `LangChainTextSplitterAdapter`
- `LangChainSemanticChunkerAdapter`
- `LangChainRecursiveCharacterTextSplitterAdapter`
- `LangChainTokenTextSplitterAdapter`
- `LangChainMarkdownTextSplitterAdapter`
- `LangChainHeaderAwareChunkTransformer`
- `LangChainDocumentMetadataExtractor`
- `LangChainEmbeddingsAdapter`
- `ChromaVectorStoreAdapter`

其中最适合直接上手的是：

- `LangChainMarkdownDirectoryLoader`：默认处理本地 markdown 目录
- `LangChainRecursiveCharacterTextSplitterAdapter`：默认文本切分预设

补充说明：

- `LangChainSemanticChunkerAdapter` 当前是协议适配器，接收实现 `createDocuments()` 或 `splitDocuments()` 的 LangChain 风格 semantic chunker；它不是对某个官方具体类的一对一硬绑定。
- 如果你需要把 LangChain metadata 中的 header、路径、位置等信息转成 `indexing` 可消费的 canonical metadata，可以额外组合 `LangChainHeaderAwareChunkTransformer` 与 `LangChainDocumentMetadataExtractor`。

### 推荐组合

- `Loader`：`LangChainMarkdownDirectoryLoader`
- `Chunker`：`LangChainRecursiveCharacterTextSplitterAdapter`
- `ChunkTransformer`：按需使用 `LangChainHeaderAwareChunkTransformer`
- `MetadataExtractor`：按需使用 `LangChainDocumentMetadataExtractor`
- `Embedder`：先用你自己的实现、本地阶段用 `MockEmbedder`，或通过 `LangChainEmbeddingsAdapter` 注入具体 LangChain embeddings 实例
- `VectorStore`：本地纯内存验证可先用 `MemoryVectorStore`，如果已经接 Chroma 可直接用 `ChromaVectorStoreAdapter`

### 示例

```ts
import {
  MemoryVectorStore,
  MockEmbedder,
  runIndexing,
} from "@monai-ragsdk/indexing";
import {
  LangChainDocumentMetadataExtractor,
  LangChainHeaderAwareChunkTransformer,
  LangChainMarkdownDirectoryLoader,
  LangChainRecursiveCharacterTextSplitterAdapter,
} from "@monai-ragsdk/adapters";

const loader = new LangChainMarkdownDirectoryLoader({
  path: "./docs",
  recursive: true,
  idPrefix: "docs",
});

const chunker = new LangChainRecursiveCharacterTextSplitterAdapter({
  chunkSize: 500,
  chunkOverlap: 50,
});

const store = new MemoryVectorStore();

const result = await runIndexing({
  loader,
  chunker,
  chunkTransformers: [new LangChainHeaderAwareChunkTransformer()],
  metadataExtractors: [new LangChainDocumentMetadataExtractor()],
  embedder: new MockEmbedder({ dimension: 8 }),
  store,
});

console.log(result);
```

### 说明

- 这是当前最符合仓库默认路线的接入方式
- 它把“具体 loader / chunker 的第三方策略”放在 `adapters`
- 这样做可以避免把 LangChain 依赖和具体实现回写到 `indexing`
- 如果默认 markdown 目录 loader 不够用，你还可以退回到 `LangChainDirectoryLoaderAdapter` 自己配置扩展名与文件 loader 映射
- 如果你需要接入语义切分器，可以优先使用 `LangChainSemanticChunkerAdapter` 包一层符合 LangChain 风格的 semantic chunker 对象
- 如果默认 recursive chunker 不够用，你还可以退回到 `LangChainTextSplitterAdapter` 自己注入任意 LangChain splitter
- 如果你需要把 header 与 source location 写进 chunk metadata，可以组合 `LangChainHeaderAwareChunkTransformer` 与 `LangChainDocumentMetadataExtractor`
- 如果你已经有 LangChain embeddings 实例，也可以通过 `LangChainEmbeddingsAdapter` 接到同一条索引流水线中

## 方案三：默认 OpenAI 兼容 embedding / chat + pgvector

### 适用场景

- 你要把索引结果写入 PostgreSQL + pgvector，并接着做检索与生成
- 你使用 OpenAI 兼容的 `/embeddings` 与 `/chat/completions`
- 你希望走当前仓库的默认生产路径，而不是 Chroma 写入或内存 store

### 当前默认能力

当前 `@monai-ragsdk/adapters` 已提供：

- `OpenAIEmbedder`
- `OpenAIRuntimeGenerator`
- `PgVectorStoreAdapter`
- `PgVectorRuntimeRetrieverAdapter`

`baseUrl` 与 chat `model` 必须由调用方显式传入，SDK 不内置厂商地址。经 `runIndexing` 时会把 chunk 原文写入 `Vector.metadata.content`，供 pgvector 的 `content` 列、关键词召回和生成使用。

### 推荐组合

- `Loader`：`LangChainMarkdownDirectoryLoader`
- `Chunker`：`SimpleChunker` 或 `LangChainRecursiveCharacterTextSplitterAdapter`
- `Embedder`：`OpenAIEmbedder`
- `VectorStore`：`PgVectorStoreAdapter`
- 查询：`PgVectorRuntimeRetrieverAdapter` + `OpenAIRuntimeGenerator` + `createDefaultRuntime()`

仓库内可运行示例见 `app/example`（`pnpm example`）。

### 说明

- 这是当前阶段 1 的默认读写闭环。
- `PgVectorStoreAdapter` 覆盖 `upsert`、`deleteByFilter()` 与 `listSourceRecords()`，可配合 `mode: "incremental"`。
- 查询期走 `PgVectorRuntimeRetrieverAdapter`，不要把检索协议塞回 `VectorStore`。
- 若自己创建了 `pg.Pool`，用完后调用 `store.close()` 与 `retriever.close()`。
- 若绕过 `runIndexing` 直接 `store.upsert()`，必须自行带上 `metadata.content`。

## 方案四：可选 Chroma store 写入方案

### 适用场景

- 你已经决定把向量写入 Chroma
- 你希望继续复用当前仓库推荐的 loader / chunker 路线
- 你不想先手写一层 `VectorStore` 包装
- 你接受当前 Chroma adapter 只覆盖写入、不覆盖查询

### 当前能力

当前 `@monai-ragsdk/adapters` 已提供 `ChromaVectorStoreAdapter`，用于把 `@monai-ragsdk/core` 的 `Vector` 批量写入指定 Chroma collection。

当前首版边界是：

- 优先支持本地 / 自建 Chroma Server
- 自动获取或创建 collection
- 只覆盖写入侧 `upsert`
- 不提前在 `adapters` 中封装查询侧抽象
- 未实现 `deleteByFilter()` / `listSourceRecords()`，因此不能作为增量索引的默认存储

### 推荐组合

- `Loader`：`LangChainMarkdownDirectoryLoader`
- `Chunker`：`LangChainRecursiveCharacterTextSplitterAdapter`
- `Embedder`：`MockEmbedder`、你自己的 `Embedder`，或 `LangChainEmbeddingsAdapter`
- `VectorStore`：`ChromaVectorStoreAdapter`

### 示例

```ts
import { MockEmbedder, runIndexing } from "@monai-ragsdk/indexing";
import {
  ChromaVectorStoreAdapter,
  LangChainMarkdownDirectoryLoader,
  LangChainRecursiveCharacterTextSplitterAdapter,
} from "@monai-ragsdk/adapters";

const loader = new LangChainMarkdownDirectoryLoader({
  path: "./docs",
  idPrefix: "docs",
});

const chunker = new LangChainRecursiveCharacterTextSplitterAdapter({
  chunkSize: 500,
  chunkOverlap: 50,
});

const store = new ChromaVectorStoreAdapter({
  host: "localhost",
  port: 8000,
  collectionName: "rag-docs",
});

const result = await runIndexing({
  loader,
  chunker,
  embedder: new MockEmbedder({ dimension: 8 }),
  store,
});

console.log(result);
```

### 说明

- 这是可选写入路径，不是当前默认生产栈。
- 该方案默认你已经启动本地 Chroma Server。
- `ChromaVectorStoreAdapter` 会在首次写入时自动获取或创建 collection。
- 如果 metadata 中包含 Chroma 不支持的嵌套 JSON 值，adapter 会尽量把它们序列化为字符串后再写入。
- 当前 `ChromaVectorStoreAdapter` 已对齐 `VectorStoreWriteContext` 的新签名，但仍只消费写入向量本身，不会主动执行 Phase D 的 stale delete 语义。
- 如果你后续要切到其他向量数据库，仍然可以替换为自定义 `VectorStore` 实现，不需要改 `runIndexing`。

## 可选扩展位

如果你已经准备进入“更接近生产”的索引构建，而不只是跑通最小链路，可以按需启用以下扩展位：

- `transformers`：用于文档级清洗、归一化和 augmentation 前置处理。
- `chunkTransformers`：用于 header 上下文增强、chunk 内容补充和 chunk 级结构修正。
- `metadataExtractors`：用于把 source path、header path、source location、sourceId、fingerprint 等信息写成 canonical metadata。
- `chunkFilters`：用于去重、低质量 chunk 过滤和保留策略控制。

如果你暂时不提供这些扩展项，`runIndexing` 会退化为旧版 MVP 路径，不影响已有接入方式。

如果你希望为未来的增量索引预留 metadata，可以额外关注：

- `mode: "incremental"`
- `sourceIdResolver`
- `fingerprintResolver`

当前这些能力会把 canonical source metadata 贯穿到 chunk 上下文与 store 写入上下文；在 `mode: "incremental"` 且 store 实现了 `listSourceRecords()` / `deleteByFilter()` 时，`runIndexing` 会执行 fingerprint skip / replace 与 stale cleanup。

## 方案五：完全自定义外部 embedder / vector store 的方案

### 适用场景

- 你已经有自己的 embedding 服务
- 你已经有自己的向量数据库或写入层
- 你希望把当前 SDK 作为统一索引编排层，而不是模型与存储实现层

### 推荐组合

- `Loader`：可用 `adapters` 默认方案，也可完全自定义
- `Chunker`：可用 `adapters` 默认 LangChain splitter，也可完全自定义
- `Embedder`：业务方自行实现
- `VectorStore`：业务方自行实现

### 示例

```ts
import type { Chunk, Vector } from "@monai-ragsdk/core";
import {
  runIndexing,
  type Embedder,
  type Loader,
  type VectorStore,
} from "@monai-ragsdk/indexing";
import {
  LangChainMarkdownDirectoryLoader,
  LangChainRecursiveCharacterTextSplitterAdapter,
} from "@monai-ragsdk/adapters";

const loader: Loader = new LangChainMarkdownDirectoryLoader({
  path: "./knowledge-base",
});

const chunker = new LangChainRecursiveCharacterTextSplitterAdapter({
  chunkSize: 400,
  chunkOverlap: 40,
});

const embedder: Embedder = {
  async embed(chunks: Chunk[]): Promise<Vector[]> {
    return Promise.all(
      chunks.map(async (chunk) => {
        const values = await requestEmbeddingFromYourService(chunk.content);

        return {
          id: chunk.id,
          values,
          metadata: chunk.metadata,
        };
      }),
    );
  },
};

const store: VectorStore = {
  async upsert(vectors: Vector[], context) {
    await upsertVectorsToYourDatabase(vectors);
    console.log("write context", context);
  },
};

const result = await runIndexing({
  loader,
  chunker,
  embedder,
  store,
});

console.log(result);

async function requestEmbeddingFromYourService(
  text: string,
): Promise<number[]> {
  return [text.length, text.length / 10];
}

async function upsertVectorsToYourDatabase(vectors: Vector[]): Promise<void> {
  console.log("upsert", vectors.length);
}
```

### 说明

- 这里的 `Loader` 和 `Chunker` 仍然可以继续复用 `@monai-ragsdk/adapters` 提供的默认预设。
- 如果你的文档切分策略需要更细粒度控制，可以把 `LangChainRecursiveCharacterTextSplitterAdapter` 替换为 `LangChainTextSplitterAdapter` 并自行注入具体 LangChain splitter。
- 如果你的 embedding 能力本身已经通过 LangChain 暴露为 `embedDocuments()`，也可以直接改用 `LangChainEmbeddingsAdapter`，不必手写 `Embedder` 包装层。

- 这是最接近真实生产接入的方式
- `indexing` 只关心你是否实现了 `Embedder` 与 `VectorStore` 契约
- 如果你实现的是自定义 `VectorStore`，建议从现在开始兼容可选的 `VectorStoreWriteContext`，这样后续进入真正的增量索引时不需要再做破坏式改动
- 它不会限制你接 OpenAI、Azure OpenAI、火山、阿里云、Pinecone、Milvus、pgvector 或业务自建服务
- 后续如果仓库要补官方适配，也应该优先放在 `adapters`，而不是改 `indexing` 主流程

## 推荐落地顺序

建议按下面顺序推进，而不是一开始就把所有外部能力都接进来：

1. 先用“最小接入方案”验证你的文档、切块和 metadata 结构。
2. 再切到“默认 LangChain loader / chunker 方案”，验证真实文档源读取与切分效果。
3. 再切到“默认 OpenAI 兼容 embedding / chat + pgvector 方案”，验证增量索引、检索与生成闭环。
4. 如果只需要 Chroma 写入，再使用“可选 Chroma store 方案”。
5. 最后再替换为你自己的 `Embedder` 与 `VectorStore`，接上其他生产环境的模型与数据库。

## 当前结论

对于今天这个仓库状态，推荐理解为：

- `indexing` 是统一编排层
- `adapters` 是默认第三方策略层
- 当前默认生产栈是 OpenAI 兼容 embedding / chat + pgvector；Ollama 与 Chroma 写入仍可选
- `Embedder` 当前既支持业务方自定义接入，也支持 `OpenAIEmbedder`、`OllamaEmbedder` 与 `LangChainEmbeddingsAdapter`
- `VectorStore` 当前既支持业务方自定义接入，也支持 `PgVectorStoreAdapter` 与 `ChromaVectorStoreAdapter`
- LangChain loader / chunker 是文档处理默认策略，但不是唯一方案
