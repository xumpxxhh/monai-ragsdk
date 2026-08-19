import type { JsonValue } from '@monai-ragsdk/core';

/**
 * runtime 本地观测动作；与 observability 的 RAGEventAction 对齐，但不引入该包类型，
 * 避免 adapters 经 RuntimeContext 解析 observability。
 */
export type RuntimeObservationAction =
  | 'receive'
  | 'preprocess'
  | 'start'
  | 'complete'
  | 'fail'
  | 'select'
  | 'drop';

/**
 * 编排器 / 自定义实现写入 context.observe 的记录。
 * 由 run-runtime 映射为 runtime.<stage>.<action>，不在业务侧依赖 RAGEvent。
 */
export type RuntimeObservationRecord = {
  stage: string;
  action: RuntimeObservationAction;
  /** Unix 毫秒时间戳；与 RAGEvent.timestamp 同一口径。 */
  timestamp: number;
  durationMs?: number;
  attributes?: Record<string, JsonValue>;
};

export type RuntimeObservationErrorRecord = RuntimeObservationRecord & {
  error: {
    name: string;
    message: string;
    code?: string;
  };
};

/**
 * 请求级观测出口。缺失时编排器必须 no-op，不能把观测当成策略链的前置依赖。
 */
export type RuntimeObservationSink = {
  emit(record: RuntimeObservationRecord): Promise<void>;
  emitError?(record: RuntimeObservationErrorRecord): Promise<void>;
};
