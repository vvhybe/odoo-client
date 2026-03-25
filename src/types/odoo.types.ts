// ─── Connection & Config ─────────────────────────────────────────────────────

export type OdooProtocol = "jsonrpc" | "xmlrpc";

/** Supported Odoo major versions */
export type OdooVersion = 14 | 15 | 16 | 17 | 18 | 19;

export interface OdooConfig {
  /** Base URL of the Odoo instance (e.g. https://mycompany.odoo.com) */
  url: string;
  /** Database name */
  db: string;
  /** Username (email) — required for password auth */
  username?: string;
  /** Password — required for password auth */
  password?: string;
  /** API Key — alternative to username/password (Odoo 14+) */
  apiKey?: string;
  /** Default protocol. Defaults to 'jsonrpc' */
  protocol?: OdooProtocol;
  /** Request timeout in milliseconds. Defaults to 30000 */
  timeout?: number;
  /** Number of retry attempts on network failure. Defaults to 3 */
  retries?: number;
  /** Base delay (ms) between retries — exponential backoff. Defaults to 500 */
  retryDelay?: number;
  /** Additional default context merged into every RPC call */
  context?: OdooContext;
  /**
   * Odoo major version (14–19). Controls version-specific API behavior:
   * - ≤16: uses `/web/dataset/call_kw` and `/web/dataset/search_read`
   * - 17+: uses `/web/dataset/call_kw/{model}/{method}`, search_read via call_kw
   * - 19+: `name_search` uses positional args instead of kwargs
   *
   * Defaults to `19` (latest).
   */
  version?: OdooVersion;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface OdooSession {
  uid: number;
  db: string;
  username: string;
  sessionId?: string;
  /** Resolved from /web/session/authenticate response */
  partnerDisplayName?: string;
  isAdmin?: boolean;
}

// ─── Domain & Context ────────────────────────────────────────────────────────

export type DomainOperator = "&" | "|" | "!";
export type DomainLeaf = [string, DomainLeafOperator, OdooFieldValue];
export type DomainLeafOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "like"
  | "ilike"
  | "not like"
  | "not ilike"
  | "in"
  | "not in"
  | "child_of"
  | "parent_of"
  | "=like"
  | "=ilike";

export type OdooDomain = Array<DomainOperator | DomainLeaf>;

export type OdooContext = Record<string, unknown>;

// ─── Field Values ─────────────────────────────────────────────────────────────

export type OdooFieldValue =
  | string
  | number
  | boolean
  | null
  | false
  | string[]
  | number[]
  | OdooMany2OneValue
  | OdooCommand[];

/** Many2one field returns [id, display_name] */
export type OdooMany2OneValue = [number, string] | false;

/**
 * Odoo ORM commands for One2many / Many2many fields.
 * @see https://www.odoo.com/documentation/17.0/developer/reference/backend/orm.html#odoo.models.Model.write
 */
export type OdooCommand =
  | [0, 0, Record<string, OdooFieldValue>] // CREATE
  | [1, number, Record<string, OdooFieldValue>] // UPDATE
  | [2, number, 0] // DELETE
  | [3, number, 0] // UNLINK
  | [4, number, 0] // LINK
  | [5, 0, 0] // CLEAR
  | [6, 0, number[]]; // REPLACE

// ─── ORM Options ─────────────────────────────────────────────────────────────

export interface SearchReadOptions {
  /** List of fields to return. Omit for all fields. */
  fields?: string[];
  /** Maximum number of records. 0 = no limit. */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order string, e.g. 'name asc, id desc' */
  order?: string;
  /** Additional context */
  context?: OdooContext;
}

export interface ReadOptions {
  fields?: string[];
  context?: OdooContext;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  order?: string;
  context?: OdooContext;
}

export interface WriteValues {
  [field: string]: OdooFieldValue;
}

// ─── Records ─────────────────────────────────────────────────────────────────

export interface OdooRecord {
  id: number;
  [field: string]: OdooFieldValue;
}

/** Generic typed record — use with model-specific interfaces */
export type TypedOdooRecord<T extends object> = { id: number } & T;

// ─── Fields meta ─────────────────────────────────────────────────────────────

export type OdooFieldType =
  | "char"
  | "text"
  | "html"
  | "integer"
  | "float"
  | "monetary"
  | "boolean"
  | "date"
  | "datetime"
  | "selection"
  | "many2one"
  | "many2many"
  | "one2many"
  | "binary"
  | "reference";

export interface OdooFieldDef {
  type: OdooFieldType;
  string: string;
  required?: boolean;
  readonly?: boolean;
  store?: boolean;
  relation?: string;
  selection?: [string, string][];
}

export type OdooFieldsGet = Record<string, OdooFieldDef>;
