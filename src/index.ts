import { JsonRpcClient } from "./clients/jsonrpc.client.js";
import { XmlRpcClient } from "./clients/xmlrpc.client.js";
import { OdooConfigError } from "./errors/odoo.errors.js";
import { AuthService } from "./services/auth.service.js";
import { OrmService } from "./services/orm.service.js";

import type { OdooConfig, OdooSession } from "./types/index.js";
import type { RetryOptions } from "./utils/retry.js";

const DEFAULTS = {
  protocol: "jsonrpc",
  timeout: 30_000,
  retries: 3,
  retryDelay: 500,
  version: 19,
} as const;

/**
 * Main entry point for the nodoo package.
 *
 * @example
 * ```ts
 * const odoo = new OdooConnect({
 *   url: 'https://mycompany.odoo.com',
 *   db: 'mydb',
 *   username: 'admin@example.com',
 *   password: 'secret',
 * });
 *
 * await odoo.authenticate();
 *
 * const partners = await odoo.orm.searchRead('res.partner', [['is_company', '=', true]], {
 *   fields: ['name', 'email', 'phone'],
 *   limit: 20,
 * });
 * ```
 */
export class OdooConnect {
  /** ORM helpers: searchRead, read, create, write, unlink, paginate… */
  readonly orm: OrmService;

  /** Low-level auth: authenticate, getSession, clearSession */
  readonly auth: AuthService;

  /** Direct JSON-RPC client for custom controller calls */
  readonly jsonRpc: JsonRpcClient;

  /** Direct XML-RPC client */
  readonly xmlRpc: XmlRpcClient;

  private readonly config: Required<
    Pick<
      OdooConfig,
      | "url"
      | "db"
      | "protocol"
      | "timeout"
      | "retries"
      | "retryDelay"
      | "version"
    >
  > &
    OdooConfig;

  constructor(userConfig: OdooConfig) {
    if (!userConfig.url) throw new OdooConfigError("config.url is required");
    if (!userConfig.db) throw new OdooConfigError("config.db is required");

    this.config = {
      ...DEFAULTS,
      ...userConfig,
      url: userConfig.url.replace(/\/+$/, ""),
    };

    const retryOptions: RetryOptions = {
      retries: this.config.retries,
      retryDelay: this.config.retryDelay,
    };

    this.jsonRpc = new JsonRpcClient(
      this.config.url,
      this.config.timeout,
      retryOptions,
      this.config.version,
    );

    this.xmlRpc = new XmlRpcClient(
      this.config.url,
      this.config.timeout,
      retryOptions,
    );

    this.auth = new AuthService(this.config, this.jsonRpc, this.xmlRpc);

    this.orm = new OrmService(
      this.config,
      this.auth,
      this.jsonRpc,
      this.xmlRpc,
    );
  }

  // ─── Auth shortcuts ───────────────────────────────────────────────────────

  /**
   * Authenticate and return the session.
   * Call this once before any ORM operations.
   */
  authenticate(): Promise<OdooSession> {
    return this.auth.authenticate();
  }

  /**
   * Returns the current session, or null if not authenticated.
   */
  getSession(): OdooSession | null {
    return this.auth.getSession();
  }

  /**
   * Clears the session. The next ORM call will require re-authentication.
   */
  disconnect(): void {
    this.auth.clearSession();
  }

  // ─── Factory ──────────────────────────────────────────────────────────────

  /**
   * Creates an OdooConnect instance and immediately authenticates.
   *
   * @example
   * const odoo = await OdooConnect.connect({
   *   url: 'https://mycompany.odoo.com',
   *   db: 'mydb',
   *   username: 'admin@example.com',
   *   password: 'secret',
   * });
   */
  static async connect(config: OdooConfig): Promise<OdooConnect> {
    const client = new OdooConnect(config);
    await client.authenticate();
    return client;
  }
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export * from "./types/index.js";
export * from "./errors/odoo.errors.js";
export { OrmService } from "./services/orm.service.js";
export { AuthService } from "./services/auth.service.js";
export { JsonRpcClient } from "./clients/jsonrpc.client.js";
export { XmlRpcClient } from "./clients/xmlrpc.client.js";
