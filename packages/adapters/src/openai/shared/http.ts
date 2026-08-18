export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export type OpenAIHttpOptions = {
  apiKey: string;
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

  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error.name === "TypeError"
  );
}

/** 向 OpenAI 兼容接口发 JSON POST；仅对 429/5xx 与瞬时网络错误重试。 */
export async function postOpenAIJson<T>(
  url: string,
  body: unknown,
  options: OpenAIHttpOptions,
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
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = (await response.text()).trim();
        const error = new Error(
          errorBody
            ? `OpenAI-compatible request failed: ${response.status} ${response.statusText}: ${errorBody}`
            : `OpenAI-compatible request failed: ${response.status} ${response.statusText}`,
        );

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

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `OpenAI-compatible request timed out after ${timeoutMs}ms`,
          {
            cause: error,
          },
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI-compatible request failed");
}

async function* readUtf8Lines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

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

function readOpenAIDeltaText(payload: {
  choices?: Array<{
    delta?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
}): string {
  const content = payload.choices?.[0]?.delta?.content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

/**
 * OpenAI 兼容 SSE：timeout 只卡到响应头；一旦开始向下游 yield，失败不再重试，避免重复 token。
 */
export async function* postOpenAISse(
  url: string,
  body: unknown,
  options: OpenAIHttpOptions,
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
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = (await response.text()).trim();
        const error = new Error(
          errorBody
            ? `OpenAI-compatible request failed: ${response.status} ${response.statusText}: ${errorBody}`
            : `OpenAI-compatible request failed: ${response.status} ${response.statusText}`,
        );

        if (attempt < retries && isRetryableStatus(response.status)) {
          lastError = error;
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        throw error;
      }

      // 响应头已到，放开总超时，避免长回答被同一把刀砍断
      clearTimeout(timeout);

      if (!response.body) {
        throw new Error("OpenAI-compatible stream returned an empty body");
      }

      startedStreaming = true;

      for await (const line of readUtf8Lines(response.body)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
          continue;
        }

        const data = trimmed.slice("data:".length).trim();

        if (data === "[DONE]") {
          return;
        }

        const payload = JSON.parse(data) as {
          error?: { message?: string } | string;
          choices?: Array<{
            delta?: {
              content?: string | Array<{ text?: string }>;
            };
          }>;
        };
        const errorMessage =
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message;

        if (errorMessage) {
          throw new Error(`OpenAI-compatible stream error: ${errorMessage}`);
        }

        const text = readOpenAIDeltaText(payload);

        if (text) {
          yield text;
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

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `OpenAI-compatible request timed out after ${timeoutMs}ms`,
          {
            cause: error,
          },
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI-compatible stream request failed");
}
