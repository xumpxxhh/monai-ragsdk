# `@monai-ragsdk/adapters`

## 定位

外部适配层。把 LangChain、OpenAI 兼容 HTTP、Ollama、pgvector、Chroma 填进 `indexing` / `runtime` 的接口。策略与编排不在本包。

默认栈：OpenAI 兼容 embedding / chat + pgvector。Ollama 仍可选。

## 依赖

- workspace：`core`、`indexing`、`runtime`
- 第三方：`@langchain/*`、`pg`、`chromadb`、`pdf-parse`、`cheerio`
- 被谁用：只有应用层（`apps/cli`、`apps/example`）。库不再依赖 adapters，把厂商锁在最外一层。

不直接依赖 `observability`：适配器只做事，trace 由 indexing / runtime 上报。

## 适配一览

| 分组 | 接到哪一层 | 内容 |
| --- | --- | --- |
| OpenAI 兼容 | indexing `Embedder`；runtime `Generator` / `StrategyModel` | `OpenAIEmbedder`、`OpenAIRuntimeGenerator`、`OpenAIStrategyModel` |
| Ollama | 同上 | `OllamaEmbedder`、`OllamaRuntimeGenerator`、`OllamaStrategyModel` |
| pgvector | indexing `VectorStore`；runtime `Retriever` | **默认查询路径** |
| LangChain | indexing loader / chunker / embedder / metadata / chunk-transformer；runtime retriever / generator | 文档加载与切分 |
| Chroma | 仅 `VectorStore.upsert` | **只写不查** |

`baseUrl` / `model` 由调用方显式传入，SDK 不内置厂商 URL。

密钥不要写进配置文件：

- embedding：`EMBEDDING_API_KEY`（`OpenAIEmbedder`）
- ask / 策略模型：`OPENAI_API_KEY`（`OpenAIRuntimeGenerator`、`OpenAIStrategyModel`）

两套 key 分开，避免和 embedding 混用。

## 使用方式

```ts
import {
  OpenAIEmbedder,
  OpenAIRuntimeGenerator,
  PgVectorRuntimeRetrieverAdapter,
  PgVectorStoreAdapter,
} from '@monai-ragsdk/adapters';
import { runIndexing, type Loader } from '@monai-ragsdk/indexing';
import { createDefaultRuntime } from '@monai-ragsdk/runtime';

const connectionString = process.env.PGVECTOR_CONNECTION_STRING!;
const tableName = 'rag_vectors';
const embedder = new OpenAIEmbedder({
  model: 'text-embedding-v3',
  baseUrl: process.env.EMBEDDING_BASE_URL!,
  dimension: 1024,
});
const store = new PgVectorStoreAdapter({
  connectionString,
  tableName,
  dimension: 1024,
  ensureTable: true,
});

declare const loader: Loader;

await runIndexing({ loader, embedder, store });

const runtime = createDefaultRuntime({
  retriever: new PgVectorRuntimeRetrieverAdapter({
    connectionString,
    tableName,
    embedQuery: (text) => embedder.embed([{ id: 'query', content: text }]).then(([v]) => v!.values),
  }),
  generator: new OpenAIRuntimeGenerator({
    model: 'deepseek-chat',
    baseUrl: process.env.OPENAI_BASE_URL!,
  }),
});
```

LangChain 目录加载、递归 / 语义 / Markdown 切分见 `demo/langchain-adapters.ts` 与 `demo/langchain-extensions.ts`。

PDF / Web / HTML 加载与代码 / 句子切分示例：

```ts
import {
  LangChainCheerioWebLoaderAdapter,
  LangChainLanguageTextSplitterAdapter,
  LangChainPdfLoaderAdapter,
  LangChainSentenceTextSplitterAdapter,
  LangChainWebLoaderAdapter,
} from '@monai-ragsdk/adapters';
import { runIndexing } from '@monai-ragsdk/indexing';

await runIndexing({
  loader: new LangChainPdfLoaderAdapter({ filePath: './docs/guide.pdf', splitPages: true }),
  chunker: new LangChainLanguageTextSplitterAdapter({ language: 'js', chunkSize: 800 }),
  embedder,
  store,
});

await runIndexing({
  loader: new LangChainWebLoaderAdapter({ urls: ['https://example.com/docs'] }),
  chunker: new LangChainSentenceTextSplitterAdapter({ chunkSize: 500 }),
  embedder,
  store,
});

await runIndexing({
  loader: new LangChainCheerioWebLoaderAdapter({
    html: '<main>FAQ content</main>',
    selector: 'main',
  }),
  embedder,
  store,
});
```

PDF loader 需要 `pdf-parse`；Web loader 需要可访问的网络。

## 脚本

```bash
pnpm --filter @monai-ragsdk/adapters test
pnpm --filter @monai-ragsdk/adapters demo
pnpm --filter @monai-ragsdk/adapters demo:openai-adapters
pnpm --filter @monai-ragsdk/adapters demo:ollama-adapters
pnpm --filter @monai-ragsdk/adapters demo:pgvector-store
pnpm --filter @monai-ragsdk/adapters demo:pgvector-runtime
pnpm --filter @monai-ragsdk/adapters demo:chroma-store
pnpm --filter @monai-ragsdk/adapters demo:langchain-runtime
pnpm --filter @monai-ragsdk/adapters demo:langchain-extensions
```

## 边界

- 不定义 pipeline 策略，不实现 `createCollection`。
- 不补 Chroma 查询，不新增第二套存储 / 查询路径。
- 不要把策略件本体搬进本包；LLM 调用实现可以留在这里。
