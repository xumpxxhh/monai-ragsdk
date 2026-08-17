import type { QueryPreprocessor } from "../interfaces/query-preprocessor.js";
import type { RetrievalPostprocessor } from "../interfaces/retrieval-postprocessor.js";
import type { RuntimeGenerator } from "../interfaces/runtime-generator.js";
import type { RuntimeRetriever } from "../interfaces/runtime-retriever.js";
import type { RAGObserver } from "@monai-ragsdk/observability";
import type { Runtime } from "../types/index.js";

import { createRuntime } from "../pipeline/create-runtime.js";
import { NoopQueryPreprocessor } from "./noop-query-preprocessor.js";
import { PassthroughRetrievalPostprocessor } from "./passthrough-retrieval-postprocessor.js";

export type CreateDefaultRuntimeOptions = {
  retriever: RuntimeRetriever;
  generator: RuntimeGenerator;
  preprocessor?: QueryPreprocessor;
  postprocessor?: RetrievalPostprocessor;
  observer?: RAGObserver;
};

export function createDefaultRuntime(
  options: CreateDefaultRuntimeOptions,
): Runtime {
  return createRuntime({
    preprocessor: options.preprocessor ?? new NoopQueryPreprocessor(),
    retriever: options.retriever,
    postprocessor:
      options.postprocessor ?? new PassthroughRetrievalPostprocessor(),
    generator: options.generator,
    observer: options.observer,
  });
}
