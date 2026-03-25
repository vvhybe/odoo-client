import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  OdooAuthenticationError,
  OdooConfigError,
} from "../../src/errors/odoo.errors.js";
import { AuthService } from "../../src/services/auth.service.js";

import type { JsonRpcClient } from "../../src/clients/jsonrpc.client.js";
import type { XmlRpcClient } from "../../src/clients/xmlrpc.client.js";
import type { OdooConfig } from "../../src/types/index.js";

const mockJsonRpc = {
  sessionAuthenticate: vi.fn(),
  clearSession: vi.fn(),
} as unknown as JsonRpcClient;

const mockXmlRpc = {
  authenticate: vi.fn(),
} as unknown as XmlRpcClient;

const baseConfig: OdooConfig = {
  url: "https://test.odoo.com",
  db: "testdb",
  username: "admin@test.com",
  password: "secret",
};

function makeService(config: OdooConfig = baseConfig) {
  return new AuthService(config, mockJsonRpc, mockXmlRpc);
}

describe("AuthService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("authenticate (jsonrpc)", () => {
    it("returns a session on valid credentials", async () => {
      (
        mockJsonRpc.sessionAuthenticate as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        uid: 2,
        session_id: "sess_abc",
        db: "testdb",
        username: "admin@test.com",
        name: "Administrator",
        partner_id: [3, "Administrator"],
        is_admin: true,
        is_internal_user: true,
        partner_display_name: "Administrator",
        user_context: {},
      });

      const service = makeService();
      const session = await service.authenticate();

      expect(session.uid).toBe(2);
      expect(session.db).toBe("testdb");
      expect(session.sessionId).toBe("sess_abc");
      expect(session.isAdmin).toBe(true);
    });

    it("throws OdooAuthenticationError when uid is false", async () => {
      (
        mockJsonRpc.sessionAuthenticate as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        uid: false,
        session_id: "",
        db: "testdb",
        username: "",
        name: "",
        partner_id: false,
        is_admin: false,
        is_internal_user: false,
        partner_display_name: "",
        user_context: {},
      });

      const service = makeService();
      await expect(service.authenticate()).rejects.toBeInstanceOf(
        OdooAuthenticationError,
      );
    });
  });

  describe("authenticate (xmlrpc)", () => {
    it("authenticates via XML-RPC and stores uid", async () => {
      (mockXmlRpc.authenticate as ReturnType<typeof vi.fn>).mockResolvedValue(
        5,
      );

      const service = makeService({ ...baseConfig, protocol: "xmlrpc" });
      const session = await service.authenticate();

      expect(session.uid).toBe(5);
      expect(mockXmlRpc.authenticate).toHaveBeenCalledWith(
        "testdb",
        "admin@test.com",
        "secret",
      );
    });

    it("throws OdooAuthenticationError when XML-RPC returns false", async () => {
      (mockXmlRpc.authenticate as ReturnType<typeof vi.fn>).mockResolvedValue(
        false,
      );

      const service = makeService({ ...baseConfig, protocol: "xmlrpc" });
      await expect(service.authenticate()).rejects.toBeInstanceOf(
        OdooAuthenticationError,
      );
    });
  });

  describe("config validation", () => {
    it("throws OdooConfigError if url is missing", async () => {
      const service = makeService({ ...baseConfig, url: "" });
      await expect(service.authenticate()).rejects.toBeInstanceOf(
        OdooConfigError,
      );
    });

    it("throws OdooConfigError if db is missing", async () => {
      const service = makeService({ ...baseConfig, db: "" });
      await expect(service.authenticate()).rejects.toBeInstanceOf(
        OdooConfigError,
      );
    });

    it("throws OdooConfigError if password is missing (no apiKey)", async () => {
      const service = makeService({ ...baseConfig, password: "" });
      await expect(service.authenticate()).rejects.toBeInstanceOf(
        OdooConfigError,
      );
    });
  });

  describe("session management", () => {
    it("requireSession throws before authentication", () => {
      const service = makeService();
      expect(() => service.requireSession()).toThrow(OdooAuthenticationError);
    });

    it("isAuthenticated returns false before authentication", () => {
      expect(makeService().isAuthenticated()).toBe(false);
    });

    it("clearSession resets state", async () => {
      (
        mockJsonRpc.sessionAuthenticate as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        uid: 2,
        session_id: "x",
        db: "testdb",
        username: "u",
        name: "U",
        partner_id: [1, "U"],
        is_admin: false,
        is_internal_user: true,
        partner_display_name: "U",
        user_context: {},
      });

      const service = makeService();
      await service.authenticate();
      expect(service.isAuthenticated()).toBe(true);

      service.clearSession();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.getSession()).toBeNull();
    });
  });
});
