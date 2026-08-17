# indexing Phase D 保留契约说明

## 目的

本文档用于说明 `indexing` 在 Phase D 已经补齐了哪些公开契约，以及这些契约当前已经做了什么、还没有做什么。

这里的重点不是“增量索引已经完成”，而是“未来要进入真正的 `Hierarchical Indexing` 与 `Incremental Indexing` 时，公开 API 已经有稳定落点”。

## 当前已落地的保留契约

### 1. `IndexingMode`

`IndexingOptions` 当前支持：

- `mode: "full" | "incremental"`

当前作用：

- 让 pipeline、chunk 级上下文、错误上下文与 metadata extractor 可以知道当前是全量还是增量模式。

当前不代表：

- 已经具备真正的增量写入策略。
- 已经具备 stale cleanup。
- 已经具备局部回滚、版本切换或状态机。

### 2. `sourceIdResolver`

`IndexingOptions` 当前支持：

- `sourceIdResolver(document) => string | undefined`

当前作用：

- 为每个文档解析 canonical `sourceId`。
- 解析后的值会透传到 `ChunkTransformer`、`ChunkFilter`、`MetadataExtractor` 上下文。
- 解析后的值会透传到 `VectorStoreWriteContext`。
- 解析后的值会回写到 chunk metadata 中，覆盖旧的同名 metadata 字段。

当前不代表：

- pipeline 会基于 `sourceId` 自动删除旧向量。

### 3. `fingerprintResolver`

`IndexingOptions` 当前支持：

- `fingerprintResolver(document) => string | undefined`

当前作用：

- 为每个文档解析 canonical `fingerprint`。
- 解析后的值会透传到 chunk 级上下文、metadata extractor 上下文与 store 写入上下文。
- 解析后的值会回写到 chunk metadata 中，覆盖旧的同名 metadata 字段。

当前不代表：

- pipeline 已经具备“新旧 fingerprint 对比 -> 自动跳过 / 替换”的行为。

### 4. `VectorStoreWriteContext`

`VectorStore.upsert()` 当前签名为：

```ts
upsert(vectors: Vector[], context?: VectorStoreWriteContext): Promise<void>
```

当前 `VectorStoreWriteContext` 包含：

- `documentId?`
- `chunkIds?`
- `mode?`
- `sourceId?`
- `fingerprint?`

当前作用：

- 让真实 store adapter 在不读取业务外部状态的前提下，也能获得最基础的写入上下文。
- 为未来的增量替换、按 source delete、按 fingerprint compare 等策略预留输入。

当前不代表：

- 所有 store adapter 都已经消费这些上下文字段。

补充说明：

- `MemoryVectorStore` 会记录最近一次写入上下文，用于测试和契约验证。
- `ChromaVectorStoreAdapter` 当前只对齐了新签名，并不会消费这些上下文字段。

### 5. 可选 `deleteByFilter()`

`VectorStore` 当前支持声明可选方法：

```ts
deleteByFilter?(filter: {
  sourceIds?: string[];
  fingerprints?: string[];
}): Promise<void>
```

当前作用：

- 为未来 stale cleanup 预留最小删除契约。
- 让 store 可以按 reserved metadata 做定向删除，而不是只能全量清空或盲写覆盖。

当前不代表：

- `runIndexing` 会主动调用它。
- 已经定义好了删除时机、删除顺序或失败恢复语义。

补充说明：

- `MemoryVectorStore` 已实现该方法，用于验证契约。
- 当前删除逻辑只按 metadata 中的 `sourceId` / `fingerprint` 过滤，不承诺更复杂的表达式能力。

### 6. 层级 metadata 保留位

`BasicMetadataExtractor` 当前会在可推导时输出：

- `hierarchyPath`
- `hierarchyDepth`
- `parentHierarchyPath`

当前作用：

- 让 markdown header 等结构信息先以 canonical metadata 形式沉淀下来。
- 为未来 parent-child retrieval、section aware rerank、层级召回打基础。

当前不代表：

- 已经存在独立的层级索引数据结构。
- 已经存在 parent-child retrieval 或层级聚合检索实现。

## 当前 pipeline 已做的事

当前 `runIndexing` 已经会：

1. 解析文档级 canonical `sourceId` 与 `fingerprint`。
2. 把它们透传到 chunk transformer、chunk filter、metadata extractor 上下文。
3. 在 chunk metadata merge 之后重新回写 canonical 值，避免旧 metadata 漂移。
4. 把这些值透传到 `VectorStoreWriteContext`。
5. 在错误上下文里保留 `documentId`、`chunkId`、`mode` 以及必要时的 `sourceId` / `fingerprint`。

## 当前明确没有做的事

当前 Phase D 仍然没有实现：

1. 自动 stale delete。
2. 基于 fingerprint 的 skip / replace 策略。
3. source 级版本管理。
4. parent-child retrieval。
5. 独立的层级索引结构。
6. 跨批次或跨运行的增量状态存储。

这些行为后续如果要进入实现阶段，需要额外定义：

- stale delete 的触发时机
- delete 与 upsert 的先后顺序
- fingerprint 的对比语义
- 删除失败时的恢复策略
- 层级 metadata 与真实检索协议之间的映射关系

## 对后续实现的约束建议

1. 不要把真正的增量逻辑直接硬塞进 `BasicMetadataExtractor` 或 `MemoryVectorStore`。
2. 不要让第三方 store adapter 反过来决定 `indexing` 的增量语义。
3. 后续如果需要更复杂的删除语义，应优先扩展过滤契约，而不是破坏现有 `VectorStore.upsert()` 签名。
4. 在真正实现 stale cleanup 前，先稳定 `sourceId` 与 `fingerprint` 的业务定义。

## 相关文档

- `packages/indexing/README.md`
- `docs/context/indexing-package-handoff.md`
- `docs/indexing/indexing-extension-architecture-draft.md`
