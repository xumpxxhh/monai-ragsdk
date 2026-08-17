import type { RAGObserver } from "@monai-ragsdk/observability";

import type { QueryPreprocessor } from "../interfaces/query-preprocessor.js";
import type { RetrievalPostprocessor } from "../interfaces/retrieval-postprocessor.js";
import type { RuntimeGenerator } from "../interfaces/runtime-generator.js";
import type { RuntimeRetriever } from "../interfaces/runtime-retriever.js";

export type CreateRuntimeOptions = {
  preprocessor: QueryPreprocessor;
  retriever: RuntimeRetriever;
  postprocessor: RetrievalPostprocessor;
  generator: RuntimeGenerator;
  observer?: RAGObserver;
};
