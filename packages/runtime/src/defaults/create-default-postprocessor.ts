import type { RetrievalPostprocessor } from "../interfaces/retrieval-postprocessor.js";

import {
  PassthroughRetrievalPostprocessor,
  type PassthroughRetrievalPostprocessorOptions,
} from "./passthrough-retrieval-postprocessor.js";

export type CreateDefaultPostprocessorOptions =
  PassthroughRetrievalPostprocessorOptions & {
    debug?: boolean;
  };

export function createDefaultPostprocessor(
  options: CreateDefaultPostprocessorOptions = {},
): RetrievalPostprocessor {
  const { debug, includeSelectionTrace, ...postprocessorOptions } = options;

  return new PassthroughRetrievalPostprocessor({
    ...postprocessorOptions,
    includeSelectionTrace: includeSelectionTrace ?? debug,
  });
}
