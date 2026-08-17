import type { RuntimeQueryInput } from "./runtime-query-input.js";
import type { RuntimeRunOptions } from "./runtime-run-options.js";

export type RuntimeContext = {
  requestId: string;
  input: RuntimeQueryInput;
  options: RuntimeRunOptions;
  startedAt: number;
};
