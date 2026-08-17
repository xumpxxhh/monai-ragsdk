import type {
  RetrievalRequest,
  RuntimeContext,
  RuntimeGenerationResult,
} from "../types/index.js";
import type { Chunk } from "@monai-ragsdk/core";

export interface RuntimeGenerator {
  generate(
    input: {
      request: RetrievalRequest;
      chunks: Chunk[];
      promptContext?: string;
    },
    context: RuntimeContext,
  ): Promise<RuntimeGenerationResult>;
}
