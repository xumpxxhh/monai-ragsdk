import {
  RAGResponseSchema,
  type Generator,
  type Query,
  type RAGResponse,
  type Retriever,
} from '../dist/index.js';

const retriever: Retriever = {
  async retrieve(_query) {
    return [
      {
        id: '1',
        content: 'RAG is Retrieval Augmented Generation',
      },
    ];
  },
};

const generator: Generator = {
  async generate({ query, chunks }) {
    return `Answer for: ${query.query} (chunks=${chunks.length})`;
  },
};

async function run(query: Query): Promise<RAGResponse> {
  const chunks = await retriever.retrieve(query);
  const answer = await generator.generate({ query, chunks });

  return RAGResponseSchema.parse({
    answer,
    chunks,
    originalQuery: query,
    effectiveQuery: query,
    citations: chunks.map((chunk, offset) => ({
      index: offset + 1,
      chunkId: chunk.id,
    })),
  });
}

const response = await run({ query: 'What is RAG?' });

console.log('runtime-like demo passed');
console.log(response);
