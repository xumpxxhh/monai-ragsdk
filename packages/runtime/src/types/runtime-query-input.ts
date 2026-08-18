import type { JsonValue } from '@monai-ragsdk/core';

export type RuntimeQueryInput = {
  query: string;
  metadata?: Record<string, JsonValue>;
};
