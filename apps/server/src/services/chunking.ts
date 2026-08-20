import type { Chunker } from '@monai-ragsdk/indexing';
import {
  HeadingBasedChunker,
  ParentChildChunker,
  SimpleChunker,
} from '@monai-ragsdk/indexing';

import type { ChunkingConfig, ChunkingStrategy, IngestMode, IngestRecommendation } from '../types/api.js';

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 50;

/** 按请求参数构建 Chunker；缺省与历史 server 行为一致（SimpleChunker 500/50）。 */
export function buildChunker(chunking?: ChunkingConfig): Chunker {
  const strategy: ChunkingStrategy = chunking?.strategy ?? 'fixed';
  if (strategy === 'heading') {
    return new HeadingBasedChunker();
  }
  if (strategy === 'parent-child') {
    return new ParentChildChunker();
  }
  const chunkSize =
    typeof chunking?.chunkSize === 'number' && chunking.chunkSize > 0
      ? chunking.chunkSize
      : DEFAULT_CHUNK_SIZE;
  const overlap =
    typeof chunking?.overlap === 'number' && chunking.overlap >= 0
      ? chunking.overlap
      : DEFAULT_OVERLAP;
  return new SimpleChunker({ chunkSize, overlap });
}

function inferLoaderHint(title: string, mimeType?: string): string {
  const lowerTitle = title.toLowerCase();
  if (mimeType?.trim()) {
    return mimeType.trim();
  }
  if (lowerTitle.endsWith('.md') || lowerTitle.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lowerTitle.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (lowerTitle.endsWith('.html') || lowerTitle.endsWith('.htm')) {
    return 'text/html';
  }
  return 'text/plain';
}

function recommendChunking(loaderHint: string): ChunkingConfig & { strategy: ChunkingStrategy } {
  if (loaderHint === 'text/markdown') {
    return { strategy: 'heading' };
  }
  if (loaderHint === 'application/pdf') {
    return { strategy: 'fixed', chunkSize: DEFAULT_CHUNK_SIZE, overlap: DEFAULT_OVERLAP };
  }
  return { strategy: 'fixed', chunkSize: DEFAULT_CHUNK_SIZE, overlap: DEFAULT_OVERLAP };
}

/** 根据文档 metadata 给出 ingest 推荐；纯文本 JSON 阶段仅信息性，不自动选 Loader。 */
export function recommendIngestConfig(
  documents: Array<{ metadata?: { title?: string; mimeType?: string } }>,
  defaultMode: IngestMode,
): IngestRecommendation {
  const sample = documents[0];
  const title = sample?.metadata?.title?.trim() ?? '';
  const loaderHint = inferLoaderHint(title, sample?.metadata?.mimeType);
  const chunking = recommendChunking(loaderHint);
  if (loaderHint === 'text/markdown' && chunking.strategy === 'heading') {
    // Markdown 长文档也可选 parent-child；推荐接口先给 heading，前端可改
    return { chunking, loaderHint, mode: defaultMode };
  }
  return { chunking, loaderHint, mode: defaultMode };
}
