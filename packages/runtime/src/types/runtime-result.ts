import type { Chunk, JsonValue, Query } from "@monai-ragsdk/core";

import type { RuntimeCitation } from "./runtime-citation.js";
import type { RuntimeDebugInfo } from "./runtime-debug-info.js";

export type RuntimeResult = {
  answer: string;
  chunks: Chunk[];
  /** 对 chunks 的 grounding 引用；顺序与 chunks 一致，检索为空时为 []。 */
  citations: RuntimeCitation[];
  originalQuery: Query;
  effectiveQuery: Query;
  retrievalMetadata?: Record<string, JsonValue>;
  postRetrievalMetadata?: Record<string, JsonValue>;
  generationMetadata?: Record<string, JsonValue>;
  debug?: RuntimeDebugInfo;
};
