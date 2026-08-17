import type {
  IndexingContext,
  IndexingStage,
} from "../types/indexing-context.js";

export type IndexingErrorOptions = ErrorOptions & {
  context?: Omit<IndexingContext, "stage">;
};

export class IndexingError extends Error {
  readonly stage: IndexingStage;
  readonly context?: Omit<IndexingContext, "stage">;

  constructor(
    message: string,
    stage: IndexingStage,
    options?: IndexingErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.stage = stage;
    this.context = options?.context;
  }
}
