import {
  type Generator,
  type Query,
  type RAGPipeline,
  type Retriever,
} from "../dist/index.js";

const retriever: Retriever = {
  async retrieve(query) {
    return [
      {
        id: "chunk-1",
        content: `retrieved for: ${query.query}`,
      },
    ];
  },
};

const generator: Generator = {
  async generate({ query, chunks }) {
    return `${query.query} -> ${chunks[0]?.content ?? "no chunk"}`;
  },
};

const pipeline: RAGPipeline = async (query: Query) => {
  const chunks = await retriever.retrieve(query);
  const answer = await generator.generate({ query, chunks });

  return {
    answer,
    chunks,
    originalQuery: query,
    effectiveQuery: query,
    citations: chunks.map((chunk, offset) => ({
      index: offset + 1,
      chunkId: chunk.id,
    })),
  };
};

console.log("pipeline demo passed");
console.log(await pipeline({ query: "Explain pipeline contract" }));
