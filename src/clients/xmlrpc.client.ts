import { OdooNetworkError } from "../errors/odoo.errors.js";
import { safeFetch, withRetry, type RetryOptions } from "../utils/retry.js";
import {
  serialiseXmlRpc,
  deserialiseXmlRpc,
  type XmlRpcValue,
} from "../utils/xmlrpc.serialiser.js";

export class XmlRpcClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retryOptions: RetryOptions;

  constructor(baseUrl: string, timeout: number, retryOptions: RetryOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeout = timeout;
    this.retryOptions = retryOptions;
  }

  // ─── Core call ────────────────────────────────────────────────────────────

  async call<T extends XmlRpcValue = XmlRpcValue>(
    endpoint: "/xmlrpc/2/common" | "/xmlrpc/2/object" | string,
    method: string,
    params: XmlRpcValue[],
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const body = serialiseXmlRpc(method, params);

    return withRetry(async () => {
      const response = await safeFetch(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "text/xml",
            Accept: "text/xml",
          },
          body,
        },
        this.timeout,
      );

      if (!response.ok) {
        throw new OdooNetworkError(
          `HTTP ${response.status} ${response.statusText} on ${url}`,
        );
      }

      const xml = await response.text();
      return (await deserialiseXmlRpc(xml)) as T;
    }, this.retryOptions);
  }

  // ─── /xmlrpc/2/common ────────────────────────────────────────────────────

  /** Returns server version info */
  async version(): Promise<Record<string, unknown>> {
    return this.call("/xmlrpc/2/common", "version", []) as Promise<
      Record<string, unknown>
    >;
  }

  /**
   * Authenticates and returns the user's numeric uid.
   * Returns `false` if credentials are wrong.
   */
  async authenticate(
    db: string,
    username: string,
    password: string,
    userAgent: Record<string, unknown> = {},
  ): Promise<number | false> {
    const result = await this.call<number | false>(
      "/xmlrpc/2/common",
      "authenticate",
      [db, username, password, userAgent as XmlRpcValue],
    );
    return result;
  }

  // ─── /xmlrpc/2/object ────────────────────────────────────────────────────

  /**
   * Calls an ORM method on a model.
   * This is the XML-RPC equivalent of JSON-RPC's call_kw.
   */
  async executeKw<T extends XmlRpcValue = XmlRpcValue>(
    db: string,
    uid: number,
    password: string,
    model: string,
    method: string,
    args: XmlRpcValue[],
    kwargs: Record<string, XmlRpcValue> = {},
  ): Promise<T> {
    return this.call<T>("/xmlrpc/2/object", "execute_kw", [
      db,
      uid,
      password,
      model,
      method,
      args,
      kwargs,
    ]);
  }
}
