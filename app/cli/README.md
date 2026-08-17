# CLI 业务入口

## 定位

`app/cli` 是一个独立的业务接入项目，用于直接消费 MonAI RAG SDK，验证本地资料目录的索引与查询链路。

当前目标是跑通最小端到端流程，并支持多命令模式：

- 读取本地目录中的文本资料
- 单独执行 indexing 并落盘索引快照
- 基于索引快照单独执行 runtime
- 也支持一条命令直接跑完整 ask 流程
- 输出 JSONL trace 到 `.artifacts/`

当前实现边界：

- 仅支持本地目录
- 默认只读取 `.md`、`.markdown`、`.txt` 文件
- 默认使用 `MockEmbedder` 与 `MemoryVectorStore`
- 不接入外部向量库与真实模型服务

## 使用方式

开发模式：

```bash
pnpm --filter @monai-ragsdk/cli cli:dev -- ask --dir ./docs --query "MonAI RAG SDK 的 runtime 是什么？"
```

构建后执行：

```bash
pnpm --filter @monai-ragsdk/cli cli -- ask --dir ./docs --query "MonAI RAG SDK 的 runtime 是什么？"
```

兼容旧用法：如果不显式写命令，CLI 默认按 `ask` 处理。

## 命令

### `ask`

端到端模式：本地目录 -> indexing -> runtime。

```bash
pnpm --filter @monai-ragsdk/cli cli:dev -- ask --dir ./docs --query "什么是 runtime" --debug
```

### `index`

只执行 indexing，并把结果写到索引快照文件。

```bash
pnpm --filter @monai-ragsdk/cli cli:dev -- index --dir ./docs --indexFile ./app/cli/.artifacts/index-snapshot.json
```

### `runtime`

读取索引快照后，支持两种子命令：

- `runtime answer`：完整 runtime answer 流程
- `runtime retrieval`：只看 retrieval 命中和分数，方便调试

如果只写 `runtime`，默认等同于 `runtime answer`。

完整 answer：

```bash
pnpm --filter @monai-ragsdk/cli cli:dev -- runtime answer --indexFile ./app/cli/.artifacts/index-snapshot.json --query "什么是 runtime" --debug
```

纯 retrieval 调试：

```bash
pnpm --filter @monai-ragsdk/cli cli:dev -- runtime retrieval --indexFile ./app/cli/.artifacts/index-snapshot.json --query "什么是 runtime" --debug
```

## 参数

- `ask`：需要 `--dir` 和 `--query`
- `index`：需要 `--dir`
- `runtime answer`：需要 `--query`，输出完整 answer
- `runtime retrieval`：需要 `--query`，只输出 retrieval 候选、分数和 metadata
- `--topK`：`ask` / `runtime` 的返回候选数量，默认 `3`
- `--chunkSize`：`ask` / `index` 的 chunk 大小，默认 `500`
- `--chunkOverlap`：`ask` / `index` 的 chunk overlap，默认 `50`
- `--extensions`：`ask` / `index` 的文件扩展名列表，默认 `.md,.markdown,.txt`
- `--indexFile`：索引快照文件路径，默认 `./app/cli/.artifacts/index-snapshot.json`
- `--traceFile`：trace 文件路径。不同命令默认不同：`ask-trace.jsonl`、`index-trace.jsonl`、`runtime-answer-trace.jsonl`、`runtime-retrieval-trace.jsonl`
- `--debug`：打印命中 chunk 的详细调试信息

## 输出

CLI 运行完成后会输出：

- `ask`：索引文档数、chunk 数、向量数、命中 chunk、最终 answer、trace 文件路径
- `index`：索引文档数、chunk 数、向量数、索引快照路径、trace 文件路径
- `runtime answer`：命中 chunk、最终 answer、索引快照路径、trace 文件路径
- `runtime retrieval`：retrieval 候选、score、可选 metadata、索引快照路径、trace 文件路径
