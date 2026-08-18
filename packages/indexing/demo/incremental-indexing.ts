import { MemoryVectorStore, MockEmbedder, SimpleChunker, runIndexing } from '../dist/index.js';

const store = new MemoryVectorStore();
const embedder = new MockEmbedder({ dimension: 4 });
const chunker = new SimpleChunker({ chunkSize: 80, overlap: 0 });

const first = await runIndexing({
  loader: {
    async load() {
      return [
        {
          id: 'guide',
          content: 'Incremental indexing skips unchanged sources.',
          metadata: {
            sourceId: 'docs/guide.md',
            fingerprint: 'fp-1',
          },
        },
        {
          id: 'faq',
          content: 'Stale sources are deleted after a later run.',
          metadata: {
            sourceId: 'docs/faq.md',
            fingerprint: 'fp-faq',
          },
        },
      ];
    },
  },
  chunker,
  embedder,
  store,
  mode: 'incremental',
});

const unchanged = await runIndexing({
  loader: {
    async load() {
      return [
        {
          id: 'guide',
          content: 'Incremental indexing skips unchanged sources.',
          metadata: {
            sourceId: 'docs/guide.md',
            fingerprint: 'fp-1',
          },
        },
        {
          id: 'faq',
          content: 'Stale sources are deleted after a later run.',
          metadata: {
            sourceId: 'docs/faq.md',
            fingerprint: 'fp-faq',
          },
        },
      ];
    },
  },
  chunker,
  embedder,
  store,
  mode: 'incremental',
});

const replaced = await runIndexing({
  loader: {
    async load() {
      return [
        {
          id: 'guide',
          content: 'Incremental indexing replaces sources when the fingerprint changes.',
          metadata: {
            sourceId: 'docs/guide.md',
            fingerprint: 'fp-2',
          },
        },
        {
          id: 'faq',
          content: 'Stale sources are deleted after a later run.',
          metadata: {
            sourceId: 'docs/faq.md',
            fingerprint: 'fp-faq',
          },
        },
      ];
    },
  },
  chunker,
  embedder,
  store,
  mode: 'incremental',
});

const stale = await runIndexing({
  loader: {
    async load() {
      return [
        {
          id: 'guide',
          content: 'Incremental indexing replaces sources when the fingerprint changes.',
          metadata: {
            sourceId: 'docs/guide.md',
            fingerprint: 'fp-2',
          },
        },
      ];
    },
  },
  chunker,
  embedder,
  store,
  mode: 'incremental',
});

console.log('indexing incremental demo passed');
console.log({
  first,
  unchanged,
  replaced,
  stale,
  stored: store.size(),
  remainingSources: [
    ...new Set(
      store
        .getAll()
        .map((vector) => vector.metadata?.sourceId)
        .filter((sourceId) => typeof sourceId === 'string'),
    ),
  ],
});
