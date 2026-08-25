import { describe, expect, it, vi } from 'vitest';

import { createDotsChatFetch } from './dots-chat-fetch.js';

describe('createDotsChatFetch', () => {
  it('rewrites Bearer to api-key and strips Content-Length when body grows', async () => {
    const baseFetch = vi.fn(async (_input, init) => {
      expect(init?.headers?.authorization).toBeUndefined();
      expect(init?.headers?.['api-key']).toBe('test-key');
      expect(init?.headers?.['content-length']).toBeUndefined();
      expect(init?.headers?.['Content-Length']).toBeUndefined();

      const parsed = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(parsed.chat_template_kwargs).toEqual({ enable_thinking: false });

      return new Response('ok', { status: 200 });
    });

    const dotsFetch = createDotsChatFetch(baseFetch);
    const originalBody = JSON.stringify({ model: 'm', messages: [] });

    await dotsFetch('https://example.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-key',
        'content-length': String(originalBody.length),
      },
      body: originalBody,
    });

    expect(baseFetch).toHaveBeenCalledOnce();
  });
});
