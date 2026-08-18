export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export type OllamaHttpOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  fetch?: FetchLike;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError' || error.name === 'TimeoutError' || error.name === 'TypeError';
}

export async function postOllamaJson<T>(
  url: string,
  body: unknown,
  options: OllamaHttpOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 200;
  const fetchImpl = options.fetch ?? fetch;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`Ollama request failed: ${response.status} ${response.statusText}`);

        if (attempt < retries && isRetryableStatus(response.status)) {
          lastError = error;
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        throw error;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;

      if (attempt < retries && isRetryableError(error)) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${timeoutMs}ms`, {
          cause: error,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Ollama request failed');
}

async function* readUtf8Lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        yield line;
      }

      if (done) {
        break;
      }
    }

    if (buffer) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Ollama NDJSON：timeout 只卡到响应头；一旦开始 yield 就不再重试，避免重复 token。
 */
export async function* postOllamaNdjson(
  url: string,
  body: unknown,
  options: OllamaHttpOptions = {},
): AsyncGenerator<string> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 200;
  const fetchImpl = options.fetch ?? fetch;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let startedStreaming = false;

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`Ollama request failed: ${response.status} ${response.statusText}`);

        if (attempt < retries && isRetryableStatus(response.status)) {
          lastError = error;
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        throw error;
      }

      clearTimeout(timeout);

      if (!response.body) {
        throw new Error('Ollama stream returned an empty body');
      }

      startedStreaming = true;

      for await (const line of readUtf8Lines(response.body)) {
        const trimmed = line.trim();

        if (!trimmed) {
          continue;
        }

        const payload = JSON.parse(trimmed) as {
          error?: string;
          message?: { content?: string };
          response?: string;
          done?: boolean;
        };

        if (payload.error) {
          throw new Error(`Ollama stream error: ${payload.error}`);
        }

        const text = payload.message?.content ?? payload.response ?? '';

        if (text) {
          yield text;
        }

        if (payload.done) {
          return;
        }
      }

      return;
    } catch (error) {
      lastError = error;

      if (startedStreaming) {
        throw error;
      }

      if (attempt < retries && isRetryableError(error)) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${timeoutMs}ms`, {
          cause: error,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Ollama stream request failed');
}
