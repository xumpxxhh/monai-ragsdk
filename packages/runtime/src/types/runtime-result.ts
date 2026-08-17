import type { Chunk, JsonValue, Query } from "@monai-ragsdk/core";

import type { RuntimeDebugInfo } from "./runtime-debug-info.js";

export type RuntimeResult = {
  answer: string;
  chunks: Chunk[];
  originalQuery: Query;
  effectiveQuery: Query;
  retrievalMetadata?: Record<string, JsonValue>;
  postRetrievalMetadata?: Record<string, JsonValue>;
  generationMetadata?: Record<string, JsonValue>;
  debug?: RuntimeDebugInfo;
};
