/**
 * Dots3（note3-prev-api）与 OpenAI 兼容适配器的差异只在 server 层消化：
 * - 鉴权用 `api-key` 头，不用 Bearer
 * - 关闭深度思考：`chat_template_kwargs.enable_thinking = false`
 *
 * 通过注入 adapters 的 `fetch` 选项实现，不改动 packages/adapters。
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

/** 为 Dots chat/completions 请求改写 header 与 body，关闭思考模式。 */
export function createDotsChatFetch(baseFetch: FetchLike = fetch): FetchLike {
  return async (input, init) => {
    const headers = { ...init?.headers };

    // adapters 默认发 Bearer；Dots 平台要求 api-key。
    const bearer = headers.authorization;
    if (typeof bearer === 'string' && bearer.startsWith('Bearer ')) {
      headers['api-key'] = bearer.slice('Bearer '.length);
      delete headers.authorization;
    }

    let body = init?.body;
    if (typeof body === 'string' && body.length > 0) {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      parsed.chat_template_kwargs = { enable_thinking: false };
      body = JSON.stringify(parsed);
    }

    return baseFetch(input, {
      ...init,
      headers,
      body,
    });
  };
}
