import type { RAGObserver } from '@monai-ragsdk/observability';

import type { QueryPreprocessor } from '../stages/pre-retrieval/query-preprocessor.js';
import type { RetrievalPostprocessor } from '../stages/post-retrieval/retrieval-postprocessor.js';
import type { RuntimeGenerator } from '../stages/generation/runtime-generator.js';
import type { RuntimeRetriever } from '../stages/retrieval/runtime-retriever.js';

export type CreateRuntimeOptions = {
  preprocessor: QueryPreprocessor;
  retriever: RuntimeRetriever;
  postprocessor: RetrievalPostprocessor;
  generator: RuntimeGenerator;
  observer?: RAGObserver;
};
