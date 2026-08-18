import type { Query } from '@monai-ragsdk/core';

import type { RuntimeStage } from '../types/index.js';
import { RuntimeError } from './runtime-error.js';

export function toRuntimeError(
  error: unknown,
  stage: RuntimeStage,
  originalQuery: Query,
  effectiveQuery?: Query,
): RuntimeError {
  if (error instanceof RuntimeError) {
    return error;
  }

  const message = error instanceof Error ? error.message : `runtime stage failed: ${stage}`;

  return new RuntimeError(message, {
    stage,
    originalQuery,
    effectiveQuery,
    cause: error,
  });
}
