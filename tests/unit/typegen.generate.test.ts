import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

import {
  generateModelTypes,
  generateTypesFile,
  modelInterfaceName,
  TYPEGEN_HEADER,
} from "../../src/index.js";

import type {
  OdooFieldDef,
  OdooFieldsGet,
  OdooFieldType,
} from "../../src/index.js";

/** `fields_get` answers captured from Odoo 18. */
function fixture(model: string): OdooFieldsGet {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/fields-get/${model}.json`),
      "utf8",
    ),
  ) as OdooFieldsGet;
}

const lineFields = fixture("pos.restock.request.line");
const partnerFields = fixture("res.partner");

/** The doc comment and declaration of one property. */
function propertyBlock(source: string, field: string): string {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.startsWith(`  ${field}:`));
  expect(index, `property ${field}`).toBeGreaterThan(0);
  return `${lines[index - 1]}\n${lines[index]}`;
}

describe("modelInterfaceName", () => {
  it.each([
    ["pos.restock.request.line", "PosRestockRequestLine"],
    ["res.partner", "ResPartner"],
    ["x_studio.my_model", "XStudioMyModel"],
    [
      "x.m; } export const evil = 1; interface Z {",
      "XMExportConstEvil1InterfaceZ",
    ],
    ["1abc.x", "Model1abcX"],
    ["...", "Model"],
  ])("names %s %s", (model, name) => {
    expect(modelInterfaceName(model)).toBe(name);
  });
});

describe("generateModelTypes", () => {
  const line = generateModelTypes("pos.restock.request.line", lineFields);
  const partner = generateModelTypes("res.partner", partnerFields);

  it("declares one exported interface named after the model", () => {
    expect(line.startsWith("export interface PosRestockRequestLine {")).toBe(
      true,
    );
    expect(line.endsWith("}")).toBe(true);
  });

  it.each([
    ["id", "  id: number;"],
    ["product_id", "  product_id: [number, string] | false;"],
    ["qty_requested", "  qty_requested: number;"],
    ["move_ids", "  move_ids: number[];"],
    ["hold", "  hold: boolean;"],
    ["hold_review_date", "  hold_review_date: string | false;"],
    ["request_date", "  request_date: string | false;"],
    ["product_name", "  product_name: string | false;"],
    [
      "state",
      '  state: "waiting" | "on_hold" | "allocated" | "done" | "declined" | false;',
    ],
  ])("types %s as search_read returns it", (field, declaration) => {
    expect(propertyBlock(line, field).split("\n")[1]).toBe(declaration);
  });

  it("documents labels, relations and date formats", () => {
    expect(propertyBlock(line, "product_id")).toContain(
      "/** Product (product.product) */",
    );
    expect(propertyBlock(line, "move_ids")).toContain(
      "/** Moves (stock.move) */",
    );
    expect(propertyBlock(line, "hold_review_date")).toContain("YYYY-MM-DD");
    expect(propertyBlock(line, "request_date")).toContain(
      "YYYY-MM-DD HH:MM:SS, UTC",
    );
  });

  it("sorts the fields by name", () => {
    expect(line.indexOf("  hold:")).toBeLessThan(line.indexOf("  id:"));
    expect(line.indexOf("  id:")).toBeLessThan(line.indexOf("  move_ids:"));
  });

  it.each([
    ["company_type", '  company_type: "person" | "company" | false;'],
    ["category_id", "  category_id: number[];"],
    ["child_ids", "  child_ids: number[];"],
    ["image_128", "  image_128: string | false;"],
    ["comment", "  comment: string | false;"],
    ["invoice_warn_msg", "  invoice_warn_msg: string | false;"],
    ["partner_latitude", "  partner_latitude: number;"],
    ["debit_limit", "  debit_limit: number;"],
    ["color", "  color: number;"],
    ["available_peppol_eas", "  available_peppol_eas: unknown;"],
    ["write_date", "  write_date: string | false;"],
  ])("types res.partner %s", (field, declaration) => {
    expect(propertyBlock(partner, field).split("\n")[1]).toBe(declaration);
  });

  it("types an empty selection as any string", () => {
    const source = generateModelTypes("x.m", {
      s: { type: "selection", string: "S", selection: [] },
    });
    expect(source).toContain("  s: string | false;");
  });

  it("writes selection keys as valid literals", () => {
    const source = generateModelTypes("x.m", {
      s: {
        type: "selection",
        string: "S",
        selection: [
          ["two words", "A"],
          ["it's", "B"],
          [1 as unknown as string, "C"],
        ],
      },
    });
    expect(source).toContain(`  s: "two words" | "it's" | 1 | false;`);
  });

  it("types reference, many2one_reference, properties and unknown types", () => {
    const source = generateModelTypes("x.m", {
      r: { type: "reference", string: "R" },
      m: { type: "many2one_reference", string: "M" },
      p: { type: "properties", string: "P" },
      z: { type: "weird" as OdooFieldType, string: "Z" },
    });
    expect(source).toContain("  r: string | false;");
    expect(source).toContain("  m: number | false;");
    expect(source).toContain("  p: unknown;");
    expect(source).toContain("  z: unknown;");
  });

  it("quotes a field name that is not a plain identifier", () => {
    const name = "a: string; } export const evil = 1; interface Z { b";
    const source = generateModelTypes("x.m", {
      [name]: { type: "char", string: "X" },
      "with-dash": { type: "integer", string: "Y" },
    });
    expect(source).toContain(`  ${JSON.stringify(name)}: string | false;`);
    expect(source).toContain('  "with-dash": number;');
    expect(
      source.split("\n").filter((line) => line.startsWith("export ")),
    ).toHaveLength(1);
  });

  it("keeps a label containing */ inside its comment", () => {
    const source = generateModelTypes("x.m", {
      a: { type: "char", string: "Ends */ here" },
    });
    expect(source).toContain("/** Ends *\\/ here */");
  });
});

describe("malformed fields_get answers", () => {
  const source = generateModelTypes("x.m", {
    a: { type: "char" } as unknown as OdooFieldDef,
    b: null as unknown as OdooFieldDef,
    c: {
      type: "selection",
      string: "C",
      selection: [3, ["k"], [], [undefined, "U"], ["ok", "OK"]],
    } as unknown as OdooFieldDef,
    d: {
      type: "many2one",
      string: 5,
      relation: { x: 1 },
    } as unknown as OdooFieldDef,
  });

  it("labels a field with its name when the label is missing or not text", () => {
    expect(source).toContain("  /** a */\n  a: string | false;");
    expect(source).toContain("  /** d */\n  d: [number, string] | false;");
  });

  it("types a missing field definition as unknown", () => {
    expect(source).toContain("  /** b */\n  b: unknown;");
  });

  it("keeps only selection entries with a text or number key", () => {
    expect(source).toContain('  c: "k" | "ok" | false;');
  });
});

describe("generateTypesFile", () => {
  const models = [
    { model: "res.partner", fields: partnerFields },
    { model: "pos.restock.request.line", fields: lineFields },
  ];
  const file = generateTypesFile(models);

  it("starts with the header and keeps the models in order", () => {
    expect(
      file.startsWith(`${TYPEGEN_HEADER}\n\nexport interface ResPartner {`),
    ).toBe(true);
    expect(file.indexOf("interface ResPartner")).toBeLessThan(
      file.indexOf("interface PosRestockRequestLine"),
    );
    expect(file.endsWith("}\n")).toBe(true);
  });

  it("separates the interfaces with one blank line", () => {
    expect(file).toContain("}\n\nexport interface PosRestockRequestLine {");
  });

  it("is deterministic", () => {
    expect(generateTypesFile(models)).toBe(file);
  });

  it("refuses two models that would share an interface name", () => {
    expect(() =>
      generateTypesFile([
        { model: "res.partner", fields: {} },
        { model: "res_partner", fields: {} },
      ]),
    ).toThrow("res.partner and res_partner both become interface ResPartner");
  });

  it("uses the exact header line", () => {
    expect(TYPEGEN_HEADER).toBe(
      "// Generated by @vvhybe/odoo-client typegen — do not edit by hand.",
    );
  });
});
