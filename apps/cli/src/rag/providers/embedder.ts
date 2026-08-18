import { MockEmbedder } from '@monai-ragsdk/indexing';
import type { Embedder } from '@monai-ragsdk/indexing';
import { OllamaEmbedder, OpenAIEmbedder } from '@monai-ragsdk/adapters';
import type { EmbeddingConfig } from '../../config/schema.js';

export function createEmbedder(config: EmbeddingConfig): Embedder {
  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbedder({
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        dimension: config.dimension,
        batchSize: config.batchSize,
      });
    case 'ollama':
      return new OllamaEmbedder({
        model: config.model,
        baseUrl: config.baseUrl,
        dimension: config.dimension,
      });
    case 'mock':
    default:
      return new MockEmbedder({
        dimension: config.dimension,
      });
  }
}
