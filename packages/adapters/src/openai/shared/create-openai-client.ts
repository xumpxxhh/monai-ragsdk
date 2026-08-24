import OpenAI from 'openai';
import type { Fetch } from 'openai/core';

/**
 * 与 apps 注入的自定义 fetch（如 Dots api-key 改写）兼容；
 * SDK 内部可能传 string URL，签名保持与历史 OpenAIHttpOptions 一致。
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export type OpenAIClientOptions = {
  apiKey: string;
  /** OpenAI 兼容 API 根地址，须由调用方显式传入。 */
  baseUrl: string;
  timeoutMs?: number;
  /** 映射到官方 SDK `maxRetries`；与历史 `retries` 同义。 */
  retries?: number;
  maxRetries?: number;
  /**
   * 历史字段：自研 HTTP 层曾用固定间隔重试；官方 SDK 自带退避，保留以免调用方类型报错。
   */
  retryDelayMs?: number;
  fetch?: FetchLike;
};

/** 构造官方 OpenAI 客户端；baseUrl / apiKey / fetch / 超时与重试由调用方显式传入。 */
export function createOpenAIClient(options: OpenAIClientOptions): OpenAI {
  const baseUrl = options.baseUrl.trim().replace(/\/$/, '');

  if (!baseUrl) {
    throw new Error('createOpenAIClient requires baseUrl');
  }

  if (!options.apiKey) {
    throw new Error('createOpenAIClient requires apiKey');
  }

  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: baseUrl,
    timeout: options.timeoutMs ?? 60_000,
    maxRetries: options.maxRetries ?? options.retries ?? 2,
    // 应用层 FetchLike 覆盖现有注入场景；SDK Fetch 接受更宽的 RequestInfo
    fetch: options.fetch as Fetch | undefined,
  });
}
