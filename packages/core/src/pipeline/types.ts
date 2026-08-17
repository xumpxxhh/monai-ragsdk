import type { Query, RAGResponse } from "../types/index.js";

export type RAGPipeline = (query: Query) => Promise<RAGResponse>;
