import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { OdooConnect } from "../index.js";
import { generateTypesFile, interfaceNameClash } from "./generate.js";

import type { OdooConfig, OdooFieldsGet, OdooVersion } from "../index.js";

/** What the command needs from the outside world; tests pass fakes. */
export interface TypegenDeps {
  connect: (config: OdooConfig) => Promise<{
    orm: {
      fieldsGet(model: string, attributes?: string[]): Promise<OdooFieldsGet>;
    };
  }>;
  /** Writes the file, creating its parent directories. */
  writeFile: (path: string, content: string) => Promise<void>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = `Usage: odoo-client typegen <model...> [--out <file>]

Writes TypeScript interfaces for the given Odoo models from fields_get.
Without --out, prints them.

Environment: ODOO_URL, ODOO_DB, ODOO_USERNAME, and ODOO_PASSWORD or ODOO_API_KEY.
Optional: ODOO_VERSION (14-19, default 19).
`;

/** The `fields_get` attributes the generator reads. */
const ATTRIBUTES = ["type", "string", "relation", "selection"];

const defaultDeps: TypegenDeps = {
  connect: (config) => OdooConnect.connect(config),
  writeFile: async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  },
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

/**
 * Runs `odoo-client typegen <model...> [--out <file>]`.
 * @returns the exit code: 0 on success, 1 for a usage or environment error
 *   (or a file that cannot be written), 2 when Odoo fails.
 */
export async function runTypegen(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: Partial<TypegenDeps> = {},
): Promise<number> {
  const io: TypegenDeps = { ...defaultDeps, ...deps };

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { out: { type: "string" }, help: { type: "boolean" } },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }
  if (parsed.values.help) {
    io.stdout(USAGE);
    return 0;
  }
  const [command, ...rest] = parsed.positionals;
  const models = [...new Set(rest)];
  if (command !== "typegen" || models.length === 0) {
    io.stderr(USAGE);
    return 1;
  }
  if (parsed.values.out === "") {
    io.stderr(`--out needs a file path.\n\n${USAGE}`);
    return 1;
  }
  const clash = interfaceNameClash(models);
  if (clash) {
    io.stderr(`${clash}\n`);
    return 1;
  }

  const config = configFromEnv(env);
  if (typeof config === "string") {
    io.stderr(`${config}\n`);
    return 1;
  }

  // Every model is fetched before anything is written, so a failure never
  // leaves a partial file.
  const fetched: { model: string; fields: OdooFieldsGet }[] = [];
  // The model being read when Odoo fails, so the message can name it.
  let current = "";
  try {
    const odoo = await io.connect(config);
    for (const model of models) {
      current = model;
      fetched.push({
        model,
        fields: await odoo.orm.fieldsGet(model, ATTRIBUTES),
      });
    }
  } catch (error) {
    const err = error as Error;
    const prefix = current ? `${current}: ` : "";
    io.stderr(`${prefix}${err.name}: ${err.message}\n`);
    return 2;
  }

  const content = generateTypesFile(fetched);
  const out = parsed.values.out;
  if (out === undefined) {
    io.stdout(content);
    return 0;
  }
  try {
    await io.writeFile(out, content);
  } catch (error) {
    io.stderr(`Cannot write ${out}: ${(error as Error).message}\n`);
    return 1;
  }
  const noun = fetched.length === 1 ? "model" : "models";
  io.stdout(`Wrote ${fetched.length} ${noun} to ${out}\n`);
  return 0;
}

/** The connection settings, or a message naming what is wrong. */
function configFromEnv(
  env: Record<string, string | undefined>,
): OdooConfig | string {
  const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, ODOO_API_KEY } = env;
  const missing = [
    !ODOO_URL && "ODOO_URL",
    !ODOO_DB && "ODOO_DB",
    !ODOO_USERNAME && "ODOO_USERNAME",
    !ODOO_PASSWORD && !ODOO_API_KEY && "ODOO_PASSWORD or ODOO_API_KEY",
  ].filter(Boolean);
  if (missing.length) {
    return `Missing environment variables: ${missing.join(", ")}`;
  }
  // fetch refuses such URLs, and its error would print the password.
  let url: URL;
  try {
    url = new URL(ODOO_URL!);
  } catch {
    return "ODOO_URL is not a valid URL.";
  }
  if (url.username || url.password) {
    return "ODOO_URL must not contain a user name or password.";
  }

  const config: OdooConfig = {
    url: ODOO_URL!,
    db: ODOO_DB!,
    username: ODOO_USERNAME!,
  };
  // The library's API-key login gives no JSON-RPC session: use XML-RPC.
  if (ODOO_API_KEY && !ODOO_PASSWORD) {
    config.apiKey = ODOO_API_KEY;
    config.protocol = "xmlrpc";
  } else {
    config.password = ODOO_PASSWORD!;
    config.protocol = "jsonrpc";
  }

  // An empty value (common for unset CI variables) means "not set".
  if (env.ODOO_VERSION) {
    const version = Number(env.ODOO_VERSION);
    if (!/^\d+$/.test(env.ODOO_VERSION) || version < 14 || version > 19) {
      return "ODOO_VERSION must be a whole number from 14 to 19.";
    }
    config.version = version as OdooVersion;
  }
  return config;
}
