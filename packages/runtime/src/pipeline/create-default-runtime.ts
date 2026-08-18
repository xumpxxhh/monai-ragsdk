import type { QueryPreprocessor } from '../stages/pre-retrieval/query-preprocessor.js';
import type { RetrievalPostprocessor } from '../stages/post-retrieval/retrieval-postprocessor.js';
import type { RuntimeGenerator } from '../stages/generation/runtime-generator.js';
import type { RuntimeRetriever } from '../stages/retrieval/runtime-retriever.js';
import type { RAGObserver } from '@monai-ragsdk/observability';
import type { Runtime } from '../types/index.js';

import { createRuntime } from './create-runtime.js';
import { NoopQueryPreprocessor } from '../stages/pre-retrieval/noop-query-preprocessor.js';
import { PassthroughRetrievalPostprocessor } from '../stages/post-retrieval/passthrough-retrieval-postprocessor.js';

export type CreateDefaultRuntimeOptions = {
  retriever: RuntimeRetriever;
  generator: RuntimeGenerator;
  preprocessor?: QueryPreprocessor;
  postprocessor?: RetrievalPostprocessor;
  observer?: RAGObserver;
};

export function createDefaultRuntime(options: CreateDefaultRuntimeOptions): Runtime {
  return createRuntime({
    preprocessor: options.preprocessor ?? new NoopQueryPreprocessor(),
    retriever: options.retriever,
    postprocessor: options.postprocessor ?? new PassthroughRetrievalPostprocessor(),
    generator: options.generator,
    observer: options.observer,
  });
}
