import type { RuntimeQueryInput } from "./runtime-query-input.js";
import type { RuntimeRunOptions } from "./runtime-run-options.js";

export type RuntimeContext = {
  requestId: string;
  input: RuntimeQueryInput;
  options: RuntimeRunOptions;
  /** Unix 毫秒时间戳；请求级对账与耗时计算用，不转 ISO。 */
  startedAt: number;
};
