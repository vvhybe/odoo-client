/**
 * Integration tests for JsonRpcClient.
 * Uses vitest + a lightweight fetch mock to simulate Odoo's HTTP responses.
 * No real Odoo instance required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { JsonRpcClient } from "../../src/clients/jsonrpc.client.js";
import {
  OdooAuthenticationError,
  OdooRpcError,
  OdooNetworkError,
} from "../../src/errors/odoo.errors.js";

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  });
}

function mockFetchFailure(error: Error) {
  return vi.fn().mockRejectedValue(error);
}

const BASE_URL = "https://test.odoo.com";
const RETRY_OPTS = { retries: 2, retryDelay: 10 };

function makeClient() {
  return new JsonRpcClient(BASE_URL, 5000, RETRY_OPTS);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("JsonRpcClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("call", () => {
    it("returns result on a successful response", async () => {
      globalThis.fetch = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: [1, 2, 3],
      });
      const client = makeClient();
      const result = await client.call("/web/dataset/call_kw", {});
      expect(result).toEqual([1, 2, 3]);
    });

    it("throws OdooAuthenticationError on access-denied RPC error", async () => {
      globalThis.fetch = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: 100,
          message: "Access denied",
          data: {
            exception_type: "odoo.exceptions.AccessDenied",
            message: "Wrong login/password",
            name: "odoo.exceptions.AccessDenied",
            debug: "",
            arguments: [],
          },
        },
      });

      const client = makeClient();
      await expect(
        client.call("/web/session/authenticate", {}),
      ).rejects.toBeInstanceOf(OdooAuthenticationError);
    });

    it("throws OdooRpcError on generic server errors", async () => {
      globalThis.fetch = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: 200,
          message: "Server error",
          data: {
            exception_type: "werkzeug.exceptions.InternalServerError",
            message: "Boom",
            name: "InternalServerError",
            debug: "Traceback...",
            arguments: [],
          },
        },
      });

      const client = makeClient();
      await expect(
        client.call("/web/dataset/call_kw", {}),
      ).rejects.toBeInstanceOf(OdooRpcError);
    });

    it("throws OdooNetworkError on non-ok HTTP responses", async () => {
      globalThis.fetch = mockFetch({ error: "bad gateway" }, 502);
      const client = makeClient();
      await expect(
        client.call("/web/dataset/call_kw", {}),
      ).rejects.toBeInstanceOf(OdooNetworkError);
    });

    it("retries on network failure and resolves", async () => {
      let calls = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        calls++;
        if (calls < 3) {
          return Promise.reject(new TypeError("fetch failed"));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () =>
            Promise.resolve({ jsonrpc: "2.0", id: 1, result: "done" }),
        });
      });

      const client = makeClient();
      const result = await client.call("/web/dataset/call_kw", {});
      expect(result).toBe("done");
      expect(calls).toBe(3);
    });

    it("throws after exhausting all retries", async () => {
      globalThis.fetch = mockFetchFailure(new TypeError("fetch failed"));
      const client = makeClient();
      await expect(
        client.call("/web/dataset/call_kw", {}),
      ).rejects.toBeInstanceOf(OdooNetworkError);
    });
  });

  describe("callKw", () => {
    it("sends correct JSON-RPC body structure", async () => {
      let capturedBody: unknown;
      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        capturedBody = JSON.parse(opts.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result: [42] }),
        });
      });

      const client = makeClient();
      await client.callKw("res.partner", "search", [[]], { limit: 5 });

      expect(capturedBody).toMatchObject({
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "res.partner",
          method: "search",
          args: [[]],
          kwargs: { limit: 5 },
        },
      });
    });
  });

  describe("session handling", () => {
    it("stores and forwards session cookies", async () => {
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = vi
        .fn()
        // First call: returns a set-cookie header
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: (h: string) =>
              h === "set-cookie" ? "session_id=abc123; Path=/" : null,
          },
          json: () =>
            Promise.resolve({ jsonrpc: "2.0", id: 1, result: { uid: 2 } }),
        })
        // Second call: we capture the Cookie header
        .mockImplementationOnce((_url, opts) => {
          capturedHeaders = opts.headers as Record<string, string>;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: () => Promise.resolve({ jsonrpc: "2.0", id: 2, result: [] }),
          });
        });

      const client = makeClient();
      await client.call("/web/session/authenticate", {});
      await client.call("/web/dataset/call_kw", {});

      expect(capturedHeaders["Cookie"]).toBe("session_id=abc123");
    });

    it("clearSession removes stored cookies", () => {
      const client = makeClient();
      client.setSessionCookies("session_id=xyz");
      client.clearSession();
      // Accessing private field via cast for test purposes
      expect(
        (client as unknown as Record<string, string>)["sessionCookies"],
      ).toBe("");
    });
  });
});
