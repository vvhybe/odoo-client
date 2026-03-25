import { describe, it, expect } from "vitest";

import {
  serialiseXmlRpc,
  deserialiseXmlRpc,
} from "../../src/utils/xmlrpc.serialiser.js";

// ─── Serialise tests ──────────────────────────────────────────────────────────

describe("serialiseXmlRpc", () => {
  it("serialises a simple authenticate call", () => {
    const xml = serialiseXmlRpc("authenticate", ["mydb", "admin", "pass", {}]);
    expect(xml).toContain("<methodName>authenticate</methodName>");
    expect(xml).toContain("<string>mydb</string>");
    expect(xml).toContain("<string>admin</string>");
  });

  it("serialises boolean true as 1", () => {
    const xml = serialiseXmlRpc("test", [true]);
    expect(xml).toContain("<boolean>1</boolean>");
  });

  it("serialises boolean false as 0", () => {
    const xml = serialiseXmlRpc("test", [false]);
    expect(xml).toContain("<boolean>0</boolean>");
  });

  it("serialises null as boolean 0", () => {
    const xml = serialiseXmlRpc("test", [null]);
    expect(xml).toContain("<boolean>0</boolean>");
  });

  it("serialises integers", () => {
    const xml = serialiseXmlRpc("test", [42]);
    expect(xml).toContain("<int>42</int>");
  });

  it("serialises floats as double", () => {
    const xml = serialiseXmlRpc("test", [3.14]);
    expect(xml).toContain("<double>3.14</double>");
  });

  it("serialises arrays", () => {
    const xml = serialiseXmlRpc("test", [["a", "b"]]);
    expect(xml).toContain("<array>");
    expect(xml).toContain("<string>a</string>");
    expect(xml).toContain("<string>b</string>");
  });

  it("serialises structs (objects)", () => {
    const xml = serialiseXmlRpc("test", [{ limit: 10 }]);
    expect(xml).toContain("<struct>");
    expect(xml).toContain("<name>limit</name>");
    expect(xml).toContain("<int>10</int>");
  });

  it("escapes XML special characters in strings", () => {
    const xml = serialiseXmlRpc("test", ['<script>&"test"</script>']);
    expect(xml).toContain("&lt;script&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
    expect(xml).not.toContain("<script>");
  });
});

// ─── Deserialise tests ────────────────────────────────────────────────────────

describe("deserialiseXmlRpc", () => {
  it("parses a uid integer response", async () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse>
        <params><param><value><int>2</int></value></param></params>
      </methodResponse>`;
    expect(await deserialiseXmlRpc(xml)).toBe(2);
  });

  it("parses a false response (failed auth)", async () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse>
        <params><param><value><boolean>0</boolean></value></param></params>
      </methodResponse>`;
    expect(await deserialiseXmlRpc(xml)).toBe(false);
  });

  it("parses a string response", async () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse>
        <params><param><value><string>hello world</string></value></param></params>
      </methodResponse>`;
    expect(await deserialiseXmlRpc(xml)).toBe("hello world");
  });

  it("parses an array of record ids", async () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse>
        <params><param>
          <value><array><data>
            <value><int>1</int></value>
            <value><int>2</int></value>
            <value><int>3</int></value>
          </data></array></value>
        </param></params>
      </methodResponse>`;
    expect(await deserialiseXmlRpc(xml)).toEqual([1, 2, 3]);
  });

  it("parses a struct (dict)", async () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse>
        <params><param>
          <value><struct>
            <member><name>id</name><value><int>5</int></value></member>
            <member><name>name</name><value><string>Acme</string></value></member>
          </struct></value>
        </param></params>
      </methodResponse>`;
    expect(await deserialiseXmlRpc(xml)).toEqual({ id: 5, name: "Acme" });
  });

  it("throws on a fault response", async () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse>
        <fault>
          <value><struct>
            <member><name>faultCode</name><value><int>1</int></value></member>
            <member><name>faultString</name><value><string>Server error</string></value></member>
          </struct></value>
        </fault>
      </methodResponse>`;
    await expect(deserialiseXmlRpc(xml)).rejects.toThrow("Server error");
  });

  it("handles nested arrays (search_read records)", async () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse>
        <params><param>
          <value><array><data>
            <value><struct>
              <member><name>id</name><value><int>1</int></value></member>
              <member><name>name</name><value><string>Test</string></value></member>
            </struct></value>
          </data></array></value>
        </param></params>
      </methodResponse>`;
    expect(await deserialiseXmlRpc(xml)).toEqual([{ id: 1, name: "Test" }]);
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe("serialise → deserialise round-trip", () => {
  it("complex execute_kw payload serialises without throwing", () => {
    const xml = serialiseXmlRpc("execute_kw", [
      "mydb",
      2,
      "password",
      "res.partner",
      "search_read",
      [[["is_company", "=", true]]],
      { fields: ["name", "email"], limit: 10 },
    ]);
    expect(xml).toContain("execute_kw");
    expect(xml).toContain("res.partner");
    expect(xml).toContain("search_read");
  });
});
