import type { JsonValue } from "@monai-ragsdk/core";

export type RuntimeGenerationResult = {
  answer: string;
  generationMetadata?: Record<string, JsonValue>;
};
