import type { RuntimeQueryInput } from "./runtime-query-input.js";
import type { RuntimeResult } from "./runtime-result.js";
import type { RuntimeRunOptions } from "./runtime-run-options.js";

export type Runtime = {
  run(
    input: RuntimeQueryInput,
    options?: RuntimeRunOptions,
  ): Promise<RuntimeResult>;
};
