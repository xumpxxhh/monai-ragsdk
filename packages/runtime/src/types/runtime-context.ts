import type { RuntimeObservationSink } from './runtime-observation.js';
import type { RuntimeQueryInput } from './runtime-query-input.js';
import type { RuntimeRunOptions } from './runtime-run-options.js';

export type RuntimeContext = {
  requestId: string;
  input: RuntimeQueryInput;
  options: RuntimeRunOptions;
  /** Unix 毫秒时间戳；请求级对账与耗时计算用，不转 ISO。 */
  startedAt: number;
  /**
   * 可选观测出口。由 createRunSession 注入；adapters 忽略即可。
   * 缺失时策略编排器跳过打点，不改变检索语义。
   */
  observe?: RuntimeObservationSink;
};
