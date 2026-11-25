import { OdooNetworkError, OdooTimeoutError } from "../errors/odoo.errors.js";

export interface RetryOptions {
  retries: number;
  retryDelay: number;
  /** Called before each retry attempt */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * ORM methods that only read. Only these are retried: a call that may change
 * data is sent once, because after a lost response Odoo may already have
 * applied it, and sending it again would apply it twice.
 */
const READ_METHODS = new Set([
  "search_read",
  "search",
  "search_count",
  "read",
  "read_group",
  "formatted_read_group",
  "name_search",
  "name_get",
  "fields_get",
  "default_get",
  "web_search_read",
  "web_read",
  "web_read_group",
]);

/** Whether `method` only reads, so a call to it is safe to send again. */
export function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method);
}

/**
 * Whether `error` is a transport failure (the request may not have reached
 * Odoo). An error Odoo returned is its answer: sending again gives the same.
 */
function isTransportFailure(error: Error): boolean {
  return error instanceof OdooNetworkError || error instanceof OdooTimeoutError;
}

/**
 * Runs `fn` with exponential backoff retries on transport failures only.
 * Errors returned by Odoo (access, validation, authentication…) are thrown
 * at once. Callers pass `retries: 0` for calls that may change data.
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

      if (!isTransportFailure(lastError)) {
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
      `Network request failed: ${hideUrlCredentials(cause?.message ?? String(error))}`,
      cause,
    );
  }
}

/** Replaces `user:password@` in any URL of `text` with `***@`. */
function hideUrlCredentials(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
