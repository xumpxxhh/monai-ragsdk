import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createJsonlTraceExporter, createRAGObserver } from '@monai-ragsdk/observability';

import { MemoryVectorStore, MockEmbedder, SimpleChunker, runIndexing } from '../dist/index.js';

const store = new MemoryVectorStore();
const traceFilePath = fileURLToPath(
  new URL('./.artifacts/run-indexing-trace.jsonl', import.meta.url),
);
const observer = createRAGObserver({
  serviceName: 'indexing-demo',
  environment: 'local-demo',
  exporters: [
    createJsonlTraceExporter({
      filePath: traceFilePath,
      append: false,
    }),
  ],
});

const result = await runIndexing({
  loader: {
    async load() {
      return [
        {
          id: 'demo/doc-1',
          content:
            'Indexing should depend on the Loader interface only, while concrete loaders come from adapters or user code.',
          metadata: {
            source: 'demo',
          },
        },
      ];
    },
  },
  chunker: new SimpleChunker({
    chunkSize: 80,
    overlap: 10,
  }),
  embedder: new MockEmbedder({ dimension: 6 }),
  observer,
  trace: {
    dataset: 'indexing-demo',
    version: 'v1',
    tags: {
      scenario: 'jsonl-trace-exporter',
    },
  },
  store,
});

await observer.shutdown?.();

const traceFileContent = await readFile(traceFilePath, 'utf-8');

console.log('indexing demo passed');
console.log('trace file:', traceFilePath);
console.log(traceFileContent.trim());
console.log(result);
console.log(store.getAll());
