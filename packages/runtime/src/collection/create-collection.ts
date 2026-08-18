import type { JsonValue, Document, Chunk, Query } from "@monai-ragsdk/core";
import type {
  IndexingMode,
  IndexingOptions,
  IndexingResult,
} from "@monai-ragsdk/indexing";
import { runIndexing } from "@monai-ragsdk/indexing";

import type {
  RuntimeRunOptions,
  RuntimeQueryInput,
  RuntimeResult,
  RuntimeCitation,
  RuntimeDebugInfo,
  Runtime,
} from "../types/index.js";
import type { VectorStoreDeleteFilter, VectorStoreSourceRecord } from "@monai-ragsdk/indexing";

/**
 * Collection（知识库门面）MVP。
 *
 * 设计目标：
 * - 仅做编排：把离线索引（`indexing.runIndexing`）与在线查询（`runtime.run`）串起来；
 * - 不在 runtime 包内部实现完整文档生命周期（阶段 3 的范围约束）。
 *
 * 不做的事：
 * - 不吞并 indexing 文档/切分职责；
 * - 不吞并 runtime 检索生成编排职责；
 * - 不引入第三方存储/查询路径（仍复用默认 stack 由 indexing/runtime 完成）。
 */
export function createCollection(options: {
  indexing: Omit<IndexingOptions, "loader">;
  runtime: Runtime;
}) {
  const indexingBase = options.indexing;
  const runtime = options.runtime;

  return {
    /**
     * 将文档写入向量库（离线索引流水线）。
     *
     * 关键控制流：
     * - 文档 -> 临时 in-memory Loader -> `runIndexing` -> store upsert
     * - stale cleanup / deleteByFilter 的行为由 indexing 的 store 契约与 options.mode 决定
     */
    async ingest(
      documents: Document[],
      ingestOptions: {
        /**
         * 增量索引语义开关。
         *
         * - `full`：允许跳过 / stale cleanup 以外的替换逻辑；
         * - `incremental`：复用 indexing 的 fingerprint + deleteByFilter 语义做 replace / stale cleanup。
         */
        mode?: IndexingMode;
      } & Partial<Pick<IndexingOptions, "observer" | "trace" | "batchSize">> = {},
    ): Promise<IndexingResult> {
      const loader = {
        async load() {
          return documents;
        },
      };

      return runIndexing({
        ...indexingBase,
        loader,
        mode: ingestOptions.mode ?? indexingBase.mode,
        // 运行时门面允许覆盖 indexing 级可观察/批处理参数，便于调用方在“同一 collection，不同任务”下做 trace 隔离。
        observer: ingestOptions.observer ?? indexingBase.observer,
        trace: ingestOptions.trace ?? indexingBase.trace,
        batchSize: ingestOptions.batchSize ?? indexingBase.batchSize,
      });
    },

    /**
     * 检索（search）：复用 runtime 的 retrieval + generation 全链路，但对外只返回 grounding 结果。
     *
     * 注意：当前 runtime 的契约是 `run()` 返回 answer + chunks/citations。
     * 阶段 3 MVP 不额外提供 “只检索不生成”的新 runtime 能力；此处仅裁剪输出形状。
     */
    async search(
      input: RuntimeQueryInput,
      runtimeOptions?: RuntimeRunOptions,
    ): Promise<CollectionSearchResult> {
      const result = await runtime.run(input, runtimeOptions);

      return {
        chunks: result.chunks,
        citations: result.citations,
        retrievalMetadata: result.retrievalMetadata,
        effectiveQuery: result.effectiveQuery,
        debug: result.debug,
      };
    },

    /**
     * 问答（ask）：直接透出 runtime 的完整 result。
     */
    async ask(
      input: RuntimeQueryInput,
      runtimeOptions?: RuntimeRunOptions,
    ): Promise<RuntimeResult> {
      return runtime.run(input, runtimeOptions);
    },

    /**
     * 列出 store 中已有的 source 记录（如果底层 store 支持）。
     *
     * 用途：
     * - 做“增量索引状态”可视化（sourceId / fingerprint）
     * - 为后续 delete/replace 提供可选输入
     *
     * 失败隔离：
     * - 如果 store 不实现 `listSourceRecords()`，直接返回空数组。
     */
    async listSources(): Promise<VectorStoreSourceRecord[]> {
      const store = indexingBase.store as unknown as {
        listSourceRecords?: () => Promise<VectorStoreSourceRecord[]>;
      };

      if (typeof store.listSourceRecords !== "function") {
        return [];
      }

      return store.listSourceRecords();
    },

    /**
     * 按 sourceIds / fingerprints 删除向量（如果底层 store 支持）。
     *
     * 返回值用于让调用方知道“是否真正执行删除”，而不是把能力缺失当作错误。
     */
    async deleteByFilters(
      filter: VectorStoreDeleteFilter,
    ): Promise<boolean> {
      const store = indexingBase.store as unknown as {
        deleteByFilter?: (filter: VectorStoreDeleteFilter) => Promise<void>;
      };

      if (typeof store.deleteByFilter !== "function") {
        return false;
      }

      await store.deleteByFilter(filter);
      return true;
    },

    /**
     * 关闭底层资源（如果底层 store 支持）。
     *
     * Memory store 之类的进程内实现通常不需要 close，因此能力缺失不作为错误抛出。
     */
    async close(): Promise<boolean> {
      const store = indexingBase.store as unknown as { close?: () => Promise<void> };

      if (typeof store.close !== "function") {
        return false;
      }

      await store.close();
      return true;
    },
  };
}

export type CollectionSearchResult = {
  chunks: Chunk[];
  citations: RuntimeCitation[];
  retrievalMetadata?: Record<string, JsonValue>;
  effectiveQuery: Query;
  debug?: RuntimeDebugInfo;
};

