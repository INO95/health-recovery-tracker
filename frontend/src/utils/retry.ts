import { ApiClientError } from "../api/client";

type RetryContext = {
  attempt: number;
  nextAttempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
};

type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (context: RetryContext) => void;
};

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return error.status >= 500 || error.status === 429;
  }
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}

export async function withRetry<T>(action: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = Math.max(0, options.retries ?? 2);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 300);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 10_000);
  const maxAttempts = retries + 1;
  const shouldRetry = options.shouldRetry || isTransientError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const nextAttempt = attempt + 1;
      const exponentialDelayMs = baseDelayMs * 2 ** (attempt - 1);
      const retryAfterMs = error instanceof ApiClientError ? error.retryAfterMs : null;
      const delayMs = Math.min(
        maxDelayMs,
        Math.max(
          exponentialDelayMs,
          retryAfterMs != null && Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0
        )
      );
      options.onRetry?.({
        attempt,
        nextAttempt,
        maxAttempts,
        delayMs,
        error,
      });
      await sleep(delayMs);
    }
  }

  throw new Error("retry_exhausted");
}
