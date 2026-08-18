import { createHash } from 'node:crypto';

import { LangChainMarkdownDirectoryLoader } from '@monai-ragsdk/adapters';
import { SimpleChunker, runIndexing } from '@monai-ragsdk/indexing';
import type { IndexingResult } from '@monai-ragsdk/indexing';

import type { ExampleStack } from './create-example-stack.js';
import { ASSETS_DIRECTORY } from './paths.js';

/** 对 assets markdown 做增量索引；未变化文档按 fingerprint 跳过 embed / upsert。 */
export async function indexExampleAssets(stack: ExampleStack): Promise<IndexingResult> {
  return runIndexing({
    loader: new LangChainMarkdownDirectoryLoader({
      path: ASSETS_DIRECTORY,
      idPrefix: 'asset',
    }),
    chunker: new SimpleChunker({
      chunkSize: 500,
      overlap: 50,
    }),
    embedder: stack.embedder,
    store: stack.store,
    mode: 'incremental',
    sourceIdResolver(document) {
      const source = document.metadata?.source;
      return typeof source === 'string' && source.length > 0 ? source : document.id;
    },
    fingerprintResolver(document) {
      return createHash('sha256').update(document.content).digest('hex');
    },
  });
}
