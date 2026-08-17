import type { Chunk, Query } from "../types/index.js";

export interface Retriever {
  retrieve(query: Query): Promise<Chunk[]>;
}
