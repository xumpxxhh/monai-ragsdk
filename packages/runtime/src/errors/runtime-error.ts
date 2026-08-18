import { RAGCoreError } from '@monai-ragsdk/core';

import type { Query } from '@monai-ragsdk/core';
import type { RuntimeStage } from '../types/index.js';

export type RuntimeErrorOptions = ErrorOptions & {
  stage: RuntimeStage;
  originalQuery: Query;
  effectiveQuery?: Query;
};

export class RuntimeError extends RAGCoreError {
  readonly stage: RuntimeStage;
  readonly originalQuery: Query;
  readonly effectiveQuery?: Query;

  constructor(message: string, options: RuntimeErrorOptions) {
    super(message, options);
    this.stage = options.stage;
    this.originalQuery = options.originalQuery;
    this.effectiveQuery = options.effectiveQuery;
  }
}
