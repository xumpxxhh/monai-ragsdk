import type {
  RetrievalRequest,
  RuntimeContext,
  RuntimeRetrievalResult,
} from '../../types/index.js';

/** routing 的 searchType 只能落在 retriever 声明的集合里；未声明则不可切换。 */
export type RuntimeRetrieverSearchType = 'vector' | 'keyword' | 'hybrid';

export type RuntimeRetrieverCapabilities = {
  searchTypes?: RuntimeRetrieverSearchType[];
};

/**
 * 在线检索器。retrieve 之外的身份 / 能力 / 生命周期过去是不成文习惯，第三方按签名实现就会丢 filters。
 * 字段均为可选：旧实现不用改就能编译；没有 id 则无法被后续 routeDecision.targets 选中。
 */
export interface RuntimeRetriever {
  readonly id?: string;
  readonly name?: string;
  readonly capabilities?: RuntimeRetrieverCapabilities;
  retrieve(request: RetrievalRequest, context: RuntimeContext): Promise<RuntimeRetrievalResult>;
  /** 释放连接池等资源；runtime.close() 会调用。缺省视为无资源需要释放。 */
  close?(): Promise<void>;
}

