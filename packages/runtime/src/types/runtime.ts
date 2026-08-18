import type { RuntimeQueryInput } from "./runtime-query-input.js";
import type { RuntimeResult } from "./runtime-result.js";
import type { RuntimeRunOptions } from "./runtime-run-options.js";
import type { RuntimeSearchResult } from "./runtime-search-result.js";
import type { RuntimeStreamEvent } from "./runtime-stream-event.js";

export type Runtime = {
  run(
    input: RuntimeQueryInput,
    options?: RuntimeRunOptions,
  ): Promise<RuntimeResult>;
  /**
   * retrieve-only：只跑 pre-retrieval → retrieval → post-retrieval。
   * 不调用 generator，因此没有 answer；citations 仍按选出的 chunks 生成。
   */
  search(
    input: RuntimeQueryInput,
    options?: RuntimeRunOptions,
  ): Promise<RuntimeSearchResult>;
  /** 检索仍一次性完成；只对流式 generation。无 generateStream 时回退为单段完整答案。 */
  runStream(
    input: RuntimeQueryInput,
    options?: RuntimeRunOptions,
  ): AsyncIterable<RuntimeStreamEvent>;
};
