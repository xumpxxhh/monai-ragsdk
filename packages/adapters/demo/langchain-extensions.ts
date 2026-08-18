import { MemoryVectorStore, MockEmbedder, runIndexing } from '@monai-ragsdk/indexing';

import {
  LangChainDocumentMetadataExtractor,
  LangChainHeaderAwareChunkTransformer,
  LangChainSemanticChunkerAdapter,
} from '../src/index.js';

const store = new MemoryVectorStore();

const result = await runIndexing({
  loader: {
    async load() {
      return [
        {
          id: 'langchain-ext-doc',
          content: '# Guide\n\n## Setup\n\nInstall dependencies.\n\nValidate results.',
          metadata: {
            source: 'demo/langchain-extensions.md',
            title: 'LangChain Extensions Demo',
          },
        },
      ];
    },
  },
  chunker: new LangChainSemanticChunkerAdapter({
    chunker: {
      async createDocuments() {
        return [
          {
            id: 'langchain-ext-doc#semantic-0',
            pageContent: 'Install dependencies.',
            metadata: {
              source: 'demo/langchain-extensions.md',
              title: 'LangChain Extensions Demo',
              'Header 1': 'Guide',
              'Header 2': 'Setup',
            },
          },
        ];
      },
    },
  }),
  chunkTransformers: [new LangChainHeaderAwareChunkTransformer()],
  metadataExtractors: [new LangChainDocumentMetadataExtractor()],
  embedder: new MockEmbedder({ dimension: 6 }),
  store,
});

console.log('langchain extension adapters demo passed');
console.log(result);
console.log(store.getAll());
