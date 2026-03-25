import {
  OdooAuthenticationError,
  OdooNetworkError,
  OdooTimeoutError,
} from "../errors/odoo.errors.js";

export interface RetryOptions {
  retries: number;
  retryDelay: number;
  /** Called before each retry attempt */
  onRetry?: (attempt: number, error: Error) => void;
}

const NON_RETRYABLE = [OdooAuthenticationError];

/**
 * Runs `fn` with exponential backoff retries.
 * Auth errors are never retried — they require user action.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Never retry auth or validation errors
      if (NON_RETRYABLE.some((Cls) => lastError instanceof Cls)) {
        throw lastError;
      }

      if (attempt < opts.retries) {
        const delay = opts.retryDelay * 2 ** attempt;
        opts.onRetry?.(attempt + 1, lastError);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Wraps a promise with a timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new OdooTimeoutError(timeoutMs)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * Wraps fetch calls to convert network errors into OdooNetworkError.
 */
export async function safeFetch(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await withTimeout(fetch(url, options), timeoutMs);
  } catch (error) {
    if (error instanceof OdooTimeoutError) throw error;
    const cause = error instanceof Error ? error : undefined;
    throw new OdooNetworkError(
      `Network request failed: ${cause?.message ?? String(error)}`,
      cause,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
