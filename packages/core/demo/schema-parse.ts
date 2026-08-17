import { ChunkSchema, QuerySchema, RAGResponseSchema } from "../dist/index.js";

const validQuery = QuerySchema.parse({ query: "What is RAG?" });
const validChunk = ChunkSchema.parse({
  id: "chunk-1",
  content: "RAG combines retrieval with generation.",
  metadata: {
    source: "demo",
    score: 0.98,
  },
});

const validResponse = RAGResponseSchema.parse({
  answer: "RAG combines retrieval with generation.",
  chunks: [validChunk],
});

const invalidQuery = QuerySchema.safeParse({ query: "" });
const invalidChunk = ChunkSchema.safeParse({
  id: "chunk-2",
  content: "invalid metadata",
  metadata: ["not-object"],
});

console.log("schema valid query:", validQuery);
console.log("schema valid response:", validResponse);
console.log("empty query rejected:", invalidQuery.success === false);
console.log("array metadata rejected:", invalidChunk.success === false);
