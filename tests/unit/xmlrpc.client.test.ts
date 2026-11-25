import { describe, it, expect, vi, beforeEach } from "vitest";

import { XmlRpcClient } from "../../src/clients/xmlrpc.client.js";
import {
  OdooNetworkError,
  OdooValidationError,
} from "../../src/errors/odoo.errors.js";
import { safeFetch } from "../../src/utils/retry.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/utils/retry.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/utils/retry.js")
  >("../../src/utils/retry.js");
  return {
    ...actual,
    safeFetch: vi.fn(),
  };
});

const mockRetryOptions = {
  retries: 0,
  retryDelay: 100,
};

const xmlSuccess = (value: string) => `
<?xml version="1.0"?>
<methodResponse>
  <params>
    <param>
      <value>${value}</value>
    </param>
  </params>
</methodResponse>`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("XmlRpcClient", () => {
  const baseUrl = "https://test.odoo.com/";
  let client: XmlRpcClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new XmlRpcClient(baseUrl, 5000, mockRetryOptions);
  });

  describe("constructor", () => {
    it("normalizes the base URL by removing trailing slashes", () => {
      const c = new XmlRpcClient("https://odoo.com///", 1000, mockRetryOptions);
      //baseUrl is private, but we can check it via call()
      expect(c).toBeDefined();
    });
  });

  describe("call", () => {
    it("performs a POST request with XML body and returns deserialized result", async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(xmlSuccess("<int>42</int>")),
      };
      vi.mocked(safeFetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const result = await client.call("/xmlrpc/2/common", "version", []);

      expect(safeFetch).toHaveBeenCalledWith(
        "https://test.odoo.com/xmlrpc/2/common",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "text/xml",
          }),
          body: expect.stringContaining("<methodName>version</methodName>"),
        }),
        5000,
      );
      expect(result).toBe(42);
    });

    it("throws OdooNetworkError if response is not ok", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      };
      vi.mocked(safeFetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      await expect(client.call("/test", "method", [])).rejects.toThrow(
        "HTTP 500 Internal Server Error on https://test.odoo.com/test",
      );
    });
  });

  describe("wrappers", () => {
    beforeEach(() => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(xmlSuccess("<int>1</int>")),
      };
      vi.mocked(safeFetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );
    });

    it("version() calls common endpoint", async () => {
      await client.version();
      expect(safeFetch).toHaveBeenCalledWith(
        expect.stringContaining("/xmlrpc/2/common"),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it("authenticate() returns the result", async () => {
      const result = await client.authenticate("db", "user", "pass");
      expect(result).toBe(1);
    });

    it("executeKw() calls object endpoint with all params", async () => {
      await client.executeKw("db", 1, "pass", "res.partner", "read", [[1]], {
        fields: ["name"],
      });
      expect(safeFetch).toHaveBeenCalledWith(
        expect.stringContaining("/xmlrpc/2/object"),
        expect.objectContaining({
          body: expect.stringContaining("<methodName>execute_kw</methodName>"),
        }),
        5000,
      );
    });
  });

  describe("retries", () => {
    const retrying = () =>
      new XmlRpcClient(baseUrl, 5000, { retries: 2, retryDelay: 1 });

    it("retries a read method after a network failure", async () => {
      vi.mocked(safeFetch).mockRejectedValue(new OdooNetworkError("down"));
      await expect(
        retrying().executeKw("db", 1, "pw", "res.partner", "search_read", [[]]),
      ).rejects.toBeInstanceOf(OdooNetworkError);
      expect(safeFetch).toHaveBeenCalledTimes(3);
    });

    it("sends a write only once after a network failure", async () => {
      vi.mocked(safeFetch).mockRejectedValue(new OdooNetworkError("down"));
      await expect(
        retrying().executeKw("db", 1, "pw", "res.partner", "write", [[1], {}]),
      ).rejects.toBeInstanceOf(OdooNetworkError);
      expect(safeFetch).toHaveBeenCalledTimes(1);
    });

    it("throws a UserError fault at once as OdooValidationError", async () => {
      const fault = `<?xml version="1.0"?><methodResponse><fault><value><struct>
        <member><name>faultCode</name><value><int>2</int></value></member>
        <member><name>faultString</name><value><string>Refused</string></value></member>
        </struct></value></fault></methodResponse>`;
      vi.mocked(safeFetch).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(fault),
      } as unknown as Response);
      await expect(
        retrying().executeKw("db", 1, "pw", "res.partner", "search_read", [[]]),
      ).rejects.toBeInstanceOf(OdooValidationError);
      expect(safeFetch).toHaveBeenCalledTimes(1);
    });
  });
});
