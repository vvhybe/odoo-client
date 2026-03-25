import { describe, it, expect, vi, beforeEach } from "vitest";

import { OrmService } from "../../src/services/orm.service.js";

import type { JsonRpcClient } from "../../src/clients/jsonrpc.client.js";
import type { XmlRpcClient } from "../../src/clients/xmlrpc.client.js";
import type { AuthService } from "../../src/services/auth.service.js";
import type { OdooConfig, OdooSession } from "../../src/types/index.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSession: OdooSession = {
  uid: 2,
  db: "test-db",
  username: "admin@test.com",
};

const mockJsonRpc = {
  callKw: vi.fn(),
  call: vi.fn(),
} as unknown as JsonRpcClient;

const mockXmlRpc = {
  executeKw: vi.fn(),
} as unknown as XmlRpcClient;

const mockAuth = {
  requireSession: vi.fn(() => mockSession),
  getSession: vi.fn(() => mockSession),
} as unknown as AuthService;

const baseConfig: OdooConfig = {
  url: "https://test.odoo.com",
  db: "test-db",
  username: "admin@test.com",
  password: "password",
  protocol: "jsonrpc",
  version: 19,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("OrmService", () => {
  let orm: OrmService;

  beforeEach(() => {
    vi.clearAllMocks();
    orm = new OrmService(baseConfig, mockAuth, mockJsonRpc, mockXmlRpc);
  });

  describe("searchRead", () => {
    it("calls JSON-RPC callKw with search_read method", async () => {
      const fakeRecords = [{ id: 1, name: "Acme" }];
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue(
        fakeRecords,
      );

      const result = await orm.searchRead(
        "res.partner",
        [["is_company", "=", true]],
        {
          fields: ["name"],
          limit: 10,
        },
      );

      expect(mockJsonRpc.callKw).toHaveBeenCalledWith(
        "res.partner",
        "search_read",
        [[["is_company", "=", true]]],
        expect.objectContaining({
          fields: ["name"],
          limit: 10,
        }),
      );
      expect(result).toEqual(fakeRecords);
    });

    it("returns empty array when no records found", async () => {
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await orm.searchRead("res.partner");
      expect(result).toEqual([]);
    });
  });

  describe("read", () => {
    it("reads records by ids", async () => {
      const fakeRecords = [
        { id: 1, name: "Acme" },
        { id: 2, name: "Globex" },
      ];
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue(
        fakeRecords,
      );

      const result = await orm.read("res.partner", [1, 2], {
        fields: ["name"],
      });

      expect(mockJsonRpc.callKw).toHaveBeenCalledWith(
        "res.partner",
        "read",
        [[1, 2]],
        expect.objectContaining({ fields: ["name"] }),
      );
      expect(result).toEqual(fakeRecords);
    });
  });

  describe("readOne", () => {
    it("returns the first record for a given id", async () => {
      const fakeRecord = { id: 5, name: "Umbrella Corp" };
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue([
        fakeRecord,
      ]);

      const result = await orm.readOne("res.partner", 5, { fields: ["name"] });
      expect(result).toEqual(fakeRecord);
    });

    it("throws OdooNotFoundError when record does not exist", async () => {
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(orm.readOne("res.partner", 9999)).rejects.toMatchObject({
        name: "OdooNotFoundError",
      });
    });
  });

  describe("create", () => {
    it("creates a record and returns its id", async () => {
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const id = await orm.create("res.partner", { name: "New Partner" });

      expect(id).toBe(42);
      expect(mockJsonRpc.callKw).toHaveBeenCalledWith(
        "res.partner",
        "create",
        [{ name: "New Partner" }],
        expect.any(Object),
      );
    });
  });

  describe("write", () => {
    it("updates records and returns true", async () => {
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await orm.write("res.partner", [1, 2], { active: false });
      expect(result).toBe(true);
    });
  });

  describe("unlink", () => {
    it("deletes records and returns true", async () => {
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await orm.unlink("res.partner", [7]);
      expect(result).toBe(true);
    });
  });

  describe("search", () => {
    it("returns a list of ids", async () => {
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue([
        1, 2, 3,
      ]);

      const ids = await orm.search("res.partner", [["active", "=", true]]);
      expect(ids).toEqual([1, 2, 3]);
    });
  });

  describe("searchCount", () => {
    it("returns the record count", async () => {
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const count = await orm.searchCount("res.partner", [
        ["is_company", "=", true],
      ]);
      expect(count).toBe(42);
    });
  });

  describe("paginate", () => {
    it("yields pages until exhausted", async () => {
      const page1 = [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ];
      const page2 = [{ id: 3, name: "C" }];

      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const pages: unknown[][] = [];
      for await (const page of orm.paginate("res.partner", [], {
        pageSize: 2,
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(2);
      expect(pages[0]).toEqual(page1);
      expect(pages[1]).toEqual(page2);
    });
  });

  describe("createMany", () => {
    it("creates multiple records", async () => {
      (mockJsonRpc.callKw as ReturnType<typeof vi.fn>).mockResolvedValue([
        10, 11, 12,
      ]);

      const ids = await orm.createMany("res.partner", [
        { name: "A" },
        { name: "B" },
        { name: "C" },
      ]);
      expect(ids).toEqual([10, 11, 12]);
    });
  });
});
