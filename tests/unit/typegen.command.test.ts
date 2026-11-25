import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  OdooAuthenticationError,
  OdooRpcError,
} from "../../src/errors/odoo.errors.js";
import { runTypegen, type TypegenDeps } from "../../src/typegen/command.js";
import { generateTypesFile } from "../../src/typegen/generate.js";

import type { OdooConfig, OdooFieldsGet } from "../../src/index.js";

function fixture(model: string): OdooFieldsGet {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/fields-get/${model}.json`),
      "utf8",
    ),
  ) as OdooFieldsGet;
}

const FIXTURES: Record<string, OdooFieldsGet> = {
  "res.partner": fixture("res.partner"),
  "pos.restock.request.line": fixture("pos.restock.request.line"),
};

const ENV = {
  ODOO_URL: "http://o",
  ODOO_DB: "d",
  ODOO_USERNAME: "u",
  ODOO_PASSWORD: "p",
};

function fakeDeps() {
  const fieldsGet = vi.fn(async (model: string) => {
    const fields = FIXTURES[model];
    if (!fields) throw new OdooRpcError(`Invalid model name: ${model}`, 200);
    return fields;
  });
  const connect = vi.fn(async (_config: OdooConfig) => ({
    orm: { fieldsGet },
  }));
  const out: string[] = [];
  const err: string[] = [];
  const deps = {
    connect,
    writeFile: vi.fn(async () => {}),
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
  } satisfies TypegenDeps;
  return { deps, connect, fieldsGet, out, err };
}

describe("runTypegen", () => {
  let fake: ReturnType<typeof fakeDeps>;

  beforeEach(() => {
    fake = fakeDeps();
  });

  it("writes the models to --out, in the order given", async () => {
    const code = await runTypegen(
      [
        "typegen",
        "res.partner",
        "pos.restock.request.line",
        "--out",
        "types/odoo.ts",
      ],
      ENV,
      fake.deps,
    );
    expect(code).toBe(0);
    expect(fake.deps.writeFile).toHaveBeenCalledTimes(1);
    expect(fake.deps.writeFile).toHaveBeenCalledWith(
      "types/odoo.ts",
      generateTypesFile([
        { model: "res.partner", fields: FIXTURES["res.partner"]! },
        {
          model: "pos.restock.request.line",
          fields: FIXTURES["pos.restock.request.line"]!,
        },
      ]),
    );
    expect(fake.out.join("")).toBe("Wrote 2 models to types/odoo.ts\n");
  });

  it("prints the file without --out", async () => {
    const code = await runTypegen(["typegen", "res.partner"], ENV, fake.deps);
    expect(code).toBe(0);
    expect(fake.deps.writeFile).not.toHaveBeenCalled();
    expect(fake.out.join("")).toBe(
      generateTypesFile([
        { model: "res.partner", fields: FIXTURES["res.partner"]! },
      ]),
    );
  });

  it("generates a repeated model once", async () => {
    await runTypegen(["typegen", "res.partner", "res.partner"], ENV, fake.deps);
    expect(fake.fieldsGet).toHaveBeenCalledTimes(1);
  });

  it("logs in with the password over JSON-RPC and asks for four attributes", async () => {
    await runTypegen(["typegen", "res.partner"], ENV, fake.deps);
    expect(fake.connect).toHaveBeenCalledWith({
      url: "http://o",
      db: "d",
      username: "u",
      password: "p",
      protocol: "jsonrpc",
    });
    expect(fake.fieldsGet).toHaveBeenCalledWith("res.partner", [
      "type",
      "string",
      "relation",
      "selection",
    ]);
  });

  it("logs in with an API key over XML-RPC", async () => {
    const code = await runTypegen(
      ["typegen", "res.partner"],
      { ...ENV, ODOO_PASSWORD: undefined, ODOO_API_KEY: "k" },
      fake.deps,
    );
    expect(code).toBe(0);
    const config = fake.connect.mock.calls[0]![0];
    expect(config).toMatchObject({ apiKey: "k", protocol: "xmlrpc" });
    expect(config.password).toBeUndefined();
  });

  it("passes a valid ODOO_VERSION", async () => {
    await runTypegen(
      ["typegen", "res.partner"],
      { ...ENV, ODOO_VERSION: "18" },
      fake.deps,
    );
    expect(fake.connect.mock.calls[0]![0]).toMatchObject({ version: 18 });
  });

  it("names every missing variable", async () => {
    const code = await runTypegen(
      ["typegen", "res.partner"],
      { ODOO_URL: "http://o" },
      fake.deps,
    );
    expect(code).toBe(1);
    const message = fake.err.join("");
    for (const name of [
      "ODOO_DB",
      "ODOO_USERNAME",
      "ODOO_PASSWORD or ODOO_API_KEY",
    ]) {
      expect(message).toContain(name);
    }
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it.each([
    ["no model", ["typegen"]],
    ["an unknown command", ["generate", "res.partner"]],
    ["an unknown option", ["typegen", "res.partner", "--bogus"]],
  ])("refuses %s with the usage", async (_label, argv) => {
    const code = await runTypegen(argv, ENV, fake.deps);
    expect(code).toBe(1);
    expect(fake.err.join("")).toContain("Usage: odoo-client typegen");
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it.each(["12", "20", "eighteen"])(
    "refuses ODOO_VERSION %s",
    async (version) => {
      const code = await runTypegen(
        ["typegen", "res.partner"],
        { ...ENV, ODOO_VERSION: version },
        fake.deps,
      );
      expect(code).toBe(1);
      expect(fake.err.join("")).toContain("ODOO_VERSION");
      expect(fake.connect).not.toHaveBeenCalled();
    },
  );

  it("prints the usage on --help without connecting", async () => {
    const code = await runTypegen(["--help"], {}, fake.deps);
    expect(code).toBe(0);
    expect(fake.out.join("")).toContain("Usage: odoo-client typegen");
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it("exits 2 on an Odoo error, without writing or a stack trace", async () => {
    const code = await runTypegen(
      ["typegen", "res.partner", "res.parnter", "--out", "t.ts"],
      ENV,
      fake.deps,
    );
    expect(code).toBe(2);
    expect(fake.err.join("")).toBe(
      "res.parnter: OdooRpcError: Invalid model name: res.parnter\n",
    );
    expect(fake.deps.writeFile).not.toHaveBeenCalled();
  });

  it("reports a failed login without a model name", async () => {
    const deps = {
      ...fake.deps,
      connect: vi.fn(async () => {
        throw new OdooAuthenticationError("Access Denied");
      }),
    };
    const code = await runTypegen(["typegen", "res.partner"], ENV, deps);
    expect(code).toBe(2);
    expect(fake.err.join("")).toBe("OdooAuthenticationError: Access Denied\n");
  });

  it("creates the --out directory when it does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "typegen-"));
    try {
      const out = join(dir, "a", "b", "types.ts");
      const { writeFile: _fake, ...rest } = fake.deps;
      const code = await runTypegen(
        ["typegen", "res.partner", "--out", out],
        ENV,
        rest,
      );
      expect(code).toBe(0);
      expect(await readFile(out, "utf8")).toBe(
        generateTypesFile([
          { model: "res.partner", fields: FIXTURES["res.partner"]! },
        ]),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
