import type { Chunk } from "@monai-ragsdk/core";

import type { RetrievalRequest } from "./retrieval-request.js";

/** generate / generateStream 共用输入，避免两套签名分叉。 */
export type RuntimeGeneratorInput = {
  request: RetrievalRequest;
  chunks: Chunk[];
  promptContext?: string;
};
