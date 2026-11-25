/**
 * The generated interfaces must work with the library's own typed reads.
 * Most of this file is checked by `npm run typecheck`, not at run time.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, vi } from "vitest";

import { OrmService } from "../../src/services/orm.service.js";
import { generateTypesFile } from "../../src/typegen/generate.js";

import type { JsonRpcClient } from "../../src/clients/jsonrpc.client.js";
import type { XmlRpcClient } from "../../src/clients/xmlrpc.client.js";
import type { AuthService } from "../../src/services/auth.service.js";
import type { OdooFieldsGet, TypedOdooRecord } from "../../src/types/index.js";
import type {
  PosRestockRequestLine,
  ResPartner,
} from "../fixtures/generated/odoo-types.js";

function fixture(model: string): OdooFieldsGet {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/fields-get/${model}.json`),
      "utf8",
    ),
  ) as OdooFieldsGet;
}

function makeOrm(result: unknown) {
  const jsonRpc = {
    callKw: vi.fn().mockResolvedValue(result),
  } as unknown as JsonRpcClient;
  return new OrmService(
    { url: "http://o", db: "d", protocol: "jsonrpc", version: 18 },
    {} as AuthService,
    jsonRpc,
    {} as XmlRpcClient,
  );
}

describe("generated interfaces", () => {
  it("match what the generator writes today", () => {
    const committed = readFileSync(
      resolve(process.cwd(), "tests/fixtures/generated/odoo-types.ts"),
      "utf8",
    );
    expect(committed).toBe(
      generateTypesFile([
        { model: "res.partner", fields: fixture("res.partner") },
        {
          model: "pos.restock.request.line",
          fields: fixture("pos.restock.request.line"),
        },
      ]),
    );
  });

  it("type searchRead, read, readOne and paginate", async () => {
    const orm = makeOrm([{ id: 7, name: "Acme", state: "on_hold" }]);

    const partners = await orm.searchRead<TypedOdooRecord<ResPartner>>(
      "res.partner",
      [],
    );
    const picked = await orm.searchRead<
      TypedOdooRecord<Pick<ResPartner, "name" | "available_peppol_eas">>
    >("res.partner", [], { fields: ["name", "available_peppol_eas"] });
    const lines = await orm.read<PosRestockRequestLine>(
      "pos.restock.request.line",
      [7],
    );
    const line = await orm.readOne<PosRestockRequestLine>(
      "pos.restock.request.line",
      7,
    );
    const pages: ResPartner[][] = [];
    for await (const page of orm.paginate<ResPartner>("res.partner", [], {
      pageSize: 10,
    })) {
      pages.push(page);
      break;
    }

    const name: string | false = partners[0]!.name;
    const state: PosRestockRequestLine["state"] = line.state;
    expect([name, picked[0]!.name, lines[0]!.id, state, pages.length]).toEqual([
      "Acme",
      "Acme",
      7,
      "on_hold",
      1,
    ]);
  });
});
