import { createOdooError, OdooNetworkError } from "../errors/odoo.errors.js";
import { safeFetch, withRetry, type RetryOptions } from "../utils/retry.js";

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcParams,
} from "../types/index.js";

let _idCounter = 1;

export class JsonRpcClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retryOptions: RetryOptions;
  private readonly version: number;
  /** Cookie-based session id set after authenticate */
  private sessionCookies: string = "";

  constructor(
    baseUrl: string,
    timeout: number,
    retryOptions: RetryOptions,
    version: number = 19,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeout = timeout;
    this.retryOptions = retryOptions;
    this.version = version;
  }

  // ─── Core call ────────────────────────────────────────────────────────────

  async call<T = unknown>(path: string, params: JsonRpcParams): Promise<T> {
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "call",
      id: _idCounter++,
      params,
    };

    const url = `${this.baseUrl}${path}`;

    return withRetry(async () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      if (this.sessionCookies) {
        headers["Cookie"] = this.sessionCookies;
      }

      const response = await safeFetch(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          credentials: "include",
        },
        this.timeout,
      );

      if (!response.ok) {
        throw new OdooNetworkError(
          `HTTP ${response.status} ${response.statusText} on ${url}`,
        );
      }

      // Capture set-cookie for Node.js environments
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        this.sessionCookies = setCookie
          .split(",")
          .map((c) => c.split(";")[0]!.trim())
          .join("; ");
      }

      const json = (await response.json()) as JsonRpcResponse<T>;

      if (json.error) {
        throw createOdooError(
          json.error.code,
          json.error.message,
          json.error.data,
        );
      }

      return json.result as T;
    }, this.retryOptions);
  }

  // ─── Convenience wrappers ─────────────────────────────────────────────────

  /** /web/session/authenticate */
  async sessionAuthenticate<T>(params: JsonRpcParams): Promise<T> {
    return this.call<T>("/web/session/authenticate", params);
  }

  /**
   * Standard ORM calls via call_kw.
   * - Odoo ≤16: `/web/dataset/call_kw`
   * - Odoo 17+: `/web/dataset/call_kw/{model}/{method}`
   */
  async callKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const path =
      this.version >= 16
        ? `/web/dataset/call_kw/${model}/${method}`
        : "/web/dataset/call_kw";

    return this.call<T>(path, {
      model,
      method,
      args,
      kwargs,
    });
  }

  /**
   * Dedicated search_read endpoint (Odoo ≤16 only).
   * On Odoo 17+ this endpoint no longer exists; use callKw('search_read') instead.
   */
  async searchRead<T>(params: JsonRpcParams): Promise<T> {
    return this.call<T>("/web/dataset/search_read", params);
  }

  /** Generic path — for advanced / custom controller calls */
  async callPath<T>(path: string, params: JsonRpcParams): Promise<T> {
    return this.call<T>(path, params);
  }

  setSessionCookies(cookies: string): void {
    this.sessionCookies = cookies;
  }

  clearSession(): void {
    this.sessionCookies = "";
  }
}
