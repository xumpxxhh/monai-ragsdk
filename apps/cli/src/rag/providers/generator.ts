import { OllamaRuntimeGenerator, OpenAIRuntimeGenerator } from '@monai-ragsdk/adapters';
import type { Chunk } from '@monai-ragsdk/core';
import type {
  RetrievalRequest,
  RuntimeGenerationResult,
  RuntimeGenerator,
} from '@monai-ragsdk/runtime';

import type { CliConfig } from '../../config/schema.js';
import { buildAnswer } from '../runtime/output.js';

export function createGenerator(config: CliConfig): RuntimeGenerator {
  if (config.generation.provider === 'openai') {
    return new OpenAIRuntimeGenerator({
      model: config.generation.model,
      baseUrl: config.generation.baseUrl,
      apiKey: config.generation.apiKey,
    });
  }

  if (config.generation.provider === 'ollama') {
    return new OllamaRuntimeGenerator({
      model: config.generation.model,
      baseUrl: config.generation.baseUrl,
    });
  }

  return {
    async generate({
      chunks,
      request,
    }: {
      chunks: Chunk[];
      request: RetrievalRequest;
    }): Promise<RuntimeGenerationResult> {
      return {
        answer: buildAnswer({
          chunks,
          query: request.effectiveQuery.query,
        }),
        generationMetadata: {
          provider: 'extractive',
          chunkIds: chunks.map((chunk) => chunk.id),
        },
      };
    },
  };
}
