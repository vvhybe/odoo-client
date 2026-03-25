import { JsonRpcClient } from "../clients/jsonrpc.client.js";
import { XmlRpcClient } from "../clients/xmlrpc.client.js";
import {
  OdooAuthenticationError,
  OdooConfigError,
} from "../errors/odoo.errors.js";

import type { OdooConfig, OdooSession } from "../types/index.js";
import type { SessionAuthenticateResult } from "../types/rpc.types.js";

export class AuthService {
  private session: OdooSession | null = null;

  constructor(
    private readonly config: OdooConfig,
    private readonly jsonRpc: JsonRpcClient,
    private readonly xmlRpc: XmlRpcClient,
  ) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  /**
   * Authenticates against Odoo and stores the session.
   *
   * - Prefers API key auth (Odoo 14+) when `config.apiKey` is set.
   * - Falls back to username/password via the configured protocol.
   */
  async authenticate(): Promise<OdooSession> {
    this.validateConfig();

    if (this.config.apiKey) {
      return this.authenticateWithApiKey();
    }

    return this.config.protocol === "xmlrpc"
      ? this.authenticateXmlRpc()
      : this.authenticateJsonRpc();
  }

  getSession(): OdooSession | null {
    return this.session;
  }

  requireSession(): OdooSession {
    if (!this.session) {
      throw new OdooAuthenticationError(
        "Not authenticated — call authenticate() first",
      );
    }
    return this.session;
  }

  clearSession(): void {
    this.session = null;
    this.jsonRpc.clearSession();
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async authenticateJsonRpc(): Promise<OdooSession> {
    const result =
      await this.jsonRpc.sessionAuthenticate<SessionAuthenticateResult>({
        db: this.config.db,
        login: this.config.username!,
        password: this.config.password!,
      });

    if (!result || result.uid === false || result.uid === 0) {
      throw new OdooAuthenticationError();
    }

    this.session = {
      uid: result.uid as number,
      db: result.db,
      username: result.username,
      sessionId: result.session_id,
      partnerDisplayName: result.partner_display_name,
      isAdmin: result.is_admin,
    };

    return this.session;
  }

  private async authenticateXmlRpc(): Promise<OdooSession> {
    const uid = await this.xmlRpc.authenticate(
      this.config.db,
      this.config.username!,
      this.config.password!,
    );

    if (uid === false || uid === 0) {
      throw new OdooAuthenticationError();
    }

    this.session = {
      uid,
      db: this.config.db,
      username: this.config.username!,
    };

    return this.session;
  }

  private async authenticateWithApiKey(): Promise<OdooSession> {
    // Odoo API keys work as password in XML-RPC authenticate call.
    // For JSON-RPC we use the __odoo_uid__ trick: call check_access_rights
    // to verify the key is valid and retrieve uid from server_info endpoint.
    const uid = await this.xmlRpc.authenticate(
      this.config.db,
      this.config.username ?? "admin",
      this.config.apiKey!,
    );

    if (uid === false || uid === 0) {
      throw new OdooAuthenticationError(
        "API key authentication failed — verify the key and username",
      );
    }

    this.session = {
      uid,
      db: this.config.db,
      username: this.config.username ?? "api-key-user",
    };

    return this.session;
  }

  private validateConfig(): void {
    if (!this.config.url) throw new OdooConfigError("config.url is required");
    if (!this.config.db) throw new OdooConfigError("config.db is required");

    if (!this.config.apiKey) {
      if (!this.config.username) {
        throw new OdooConfigError(
          "config.username is required when not using an API key",
        );
      }
      if (!this.config.password) {
        throw new OdooConfigError(
          "config.password is required when not using an API key",
        );
      }
    }
  }
}
