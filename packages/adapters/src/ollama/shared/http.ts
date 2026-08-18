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

  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error.name === "TypeError"
  );
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
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(
          `Ollama request failed: ${response.status} ${response.statusText}`,
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
        throw new Error(`Ollama request timed out after ${timeoutMs}ms`, {
          cause: error,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Ollama request failed");
}
