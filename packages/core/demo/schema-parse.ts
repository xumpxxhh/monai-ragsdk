import { ChunkSchema, QuerySchema, RAGResponseSchema } from '../dist/index.js';

const validQuery = QuerySchema.parse({
  query: 'What is RAG?',
  metadata: { source: 'demo' },
});
const validChunk = ChunkSchema.parse({
  id: 'chunk-1',
  content: 'RAG combines retrieval with generation.',
  metadata: {
    source: 'demo',
    score: 0.98,
  },
});

const validResponse = RAGResponseSchema.parse({
  answer: 'RAG combines retrieval with generation.',
  chunks: [validChunk],
  originalQuery: validQuery,
  effectiveQuery: validQuery,
  citations: [
    {
      index: 1,
      chunkId: validChunk.id,
    },
  ],
});

const invalidQuery = QuerySchema.safeParse({ query: '' });
const invalidChunk = ChunkSchema.safeParse({
  id: 'chunk-2',
  content: 'invalid metadata',
  metadata: ['not-object'],
});
const invalidResponse = RAGResponseSchema.safeParse({
  answer: 'missing audit fields',
  chunks: [validChunk],
});

console.log('schema valid query:', validQuery);
console.log('schema valid response:', validResponse);
console.log('empty query rejected:', invalidQuery.success === false);
console.log('array metadata rejected:', invalidChunk.success === false);
console.log('response missing citations rejected:', invalidResponse.success === false);
