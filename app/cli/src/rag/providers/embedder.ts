import { MockEmbedder } from "@monai-ragsdk/indexing";
import type { Embedder } from "@monai-ragsdk/indexing";

import { OllamaEmbedder } from "../embedders/ollama.js";
import type { EmbeddingConfig } from "../../config/schema.js";

export function createEmbedder(config: EmbeddingConfig): Embedder {
  switch (config.provider) {
    case "ollama":
      return new OllamaEmbedder({
        model: config.model,
        baseUrl: config.baseUrl,
        dimension: config.dimension,
      });
    case "mock":
    default:
      return new MockEmbedder({
        dimension: config.dimension,
      });
  }
}
