import { JsonRpcClient } from "../clients/jsonrpc.client.js";
import { XmlRpcClient } from "../clients/xmlrpc.client.js";

import type { AuthService } from "./auth.service.js";
import type {
  OdooConfig,
  OdooDomain,
  OdooRecord,
  OdooFieldsGet,
  SearchReadOptions,
  ReadOptions,
  SearchOptions,
  WriteValues,
  OdooContext,
  TypedOdooRecord,
} from "../types/index.js";
import type { SearchReadResult } from "../types/rpc.types.js";
import type { XmlRpcValue } from "../utils/xmlrpc.serialiser.js";

export class OrmService {
  private readonly defaultContext: OdooContext;
  private readonly version: number;

  constructor(
    private readonly config: OdooConfig,
    private readonly auth: AuthService,
    private readonly jsonRpc: JsonRpcClient,
    private readonly xmlRpc: XmlRpcClient,
  ) {
    this.defaultContext = config.context ?? {};
    this.version = config.version ?? 19;
  }

  // ─── Read operations ──────────────────────────────────────────────────────

  /**
   * Search and return full records in one RPC call.
   * Equivalent to model.search_read() on the server.
   */
  async searchRead<T extends OdooRecord = OdooRecord>(
    model: string,
    domain: OdooDomain = [],
    options: SearchReadOptions = {},
  ): Promise<T[]> {
    if (this.config.protocol === "xmlrpc") {
      return this.xmlRpcExecuteKw<T[]>(model, "search_read", [domain], {
        fields: options.fields ?? [],
        limit: options.limit ?? 0,
        offset: options.offset ?? 0,
        order: options.order ?? "",
        context: this.mergeContext(options.context),
      });
    }

    // Odoo ≤15: use the dedicated /web/dataset/search_read endpoint
    if (this.version < 16) {
      const result = await this.jsonRpc.searchRead<SearchReadResult<T>>({
        model,
        domain,
        fields: options.fields ?? [],
        limit: options.limit ?? 80,
        offset: options.offset ?? 0,
        sort: options.order ?? "",
        context: this.mergeContext(options.context),
      });
      return result.records;
    }

    // Odoo 17+: search_read via call_kw
    return this.callKw<T[]>(model, "search_read", [domain], {
      fields: options.fields ?? [],
      limit: options.limit ?? 80,
      offset: options.offset ?? 0,
      order: options.order ?? "",
      context: this.mergeContext(options.context),
    });
  }

  /**
   * Read specific records by ids.
   */
  async read<T extends OdooRecord = OdooRecord>(
    model: string,
    ids: number[],
    options: ReadOptions = {},
  ): Promise<T[]> {
    return this.callKw<T[]>(model, "read", [ids], {
      fields: options.fields ?? [],
      context: this.mergeContext(options.context),
    });
  }

  /**
   * Search and return a list of ids.
   */
  async search(
    model: string,
    domain: OdooDomain = [],
    options: SearchOptions = {},
  ): Promise<number[]> {
    return this.callKw<number[]>(model, "search", [domain], {
      limit: options.limit ?? 0,
      offset: options.offset ?? 0,
      order: options.order ?? "",
      context: this.mergeContext(options.context),
    });
  }

  /**
   * Return the number of records matching a domain.
   */
  async searchCount(
    model: string,
    domain: OdooDomain = [],
    context?: OdooContext,
  ): Promise<number> {
    return this.callKw<number>(model, "search_count", [domain], {
      context: this.mergeContext(context),
    });
  }

  /**
   * Returns [(id, display_name)] pairs matching `name`.
   * Useful for autocomplete/select fields.
   */
  async nameSearch(
    model: string,
    name: string,
    domain: OdooDomain = [],
    limit = 8,
    context?: OdooContext,
  ): Promise<[number, string][]> {
    // Odoo 19+: name_search uses positional args [name, domain]
    if (this.version >= 19) {
      return this.callKw<[number, string][]>(
        model,
        "name_search",
        [name, domain],
        {
          limit,
          context: this.mergeContext(context),
        },
      );
    }

    // Odoo ≤18: name_search uses kwargs {name, args, limit}
    return this.callKw<[number, string][]>(model, "name_search", [], {
      name,
      args: domain,
      limit,
      context: this.mergeContext(context),
    });
  }

  /**
   * Read a single record by id. Throws OdooNotFoundError if missing.
   */
  async readOne<T extends OdooRecord = OdooRecord>(
    model: string,
    id: number,
    options: ReadOptions = {},
  ): Promise<TypedOdooRecord<T>> {
    const records = await this.read<T>(model, [id], options);
    if (!records.length) {
      const { OdooNotFoundError } = await import("../errors/odoo.errors.js");
      throw new OdooNotFoundError(model, id);
    }
    return records[0]! as TypedOdooRecord<T>;
  }

  // ─── Write operations ─────────────────────────────────────────────────────

  /**
   * Creates a new record and returns its id.
   */
  async create(
    model: string,
    values: WriteValues,
    context?: OdooContext,
  ): Promise<number> {
    return this.callKw<number>(model, "create", [values], {
      context: this.mergeContext(context),
    });
  }

  /**
   * Creates multiple records at once (Odoo 16+ supports list of dicts).
   * Falls back to sequential creates on older versions.
   */
  async createMany(
    model: string,
    valuesList: WriteValues[],
    context?: OdooContext,
  ): Promise<number[]> {
    try {
      const result = await this.callKw<number | number[]>(
        model,
        "create",
        [valuesList],
        { context: this.mergeContext(context) },
      );
      return Array.isArray(result) ? result : [result];
    } catch {
      // Fallback: sequential creates for older Odoo versions
      const ids: number[] = [];
      for (const values of valuesList) {
        ids.push(await this.create(model, values, context));
      }
      return ids;
    }
  }

  /**
   * Updates records matching ids with values.
   */
  async write(
    model: string,
    ids: number[],
    values: WriteValues,
    context?: OdooContext,
  ): Promise<boolean> {
    return this.callKw<boolean>(model, "write", [ids, values], {
      context: this.mergeContext(context),
    });
  }

  /**
   * Deletes records by ids.
   */
  async unlink(
    model: string,
    ids: number[],
    context?: OdooContext,
  ): Promise<boolean> {
    return this.callKw<boolean>(model, "unlink", [ids], {
      context: this.mergeContext(context),
    });
  }

  // ─── Meta / misc ──────────────────────────────────────────────────────────

  /**
   * Returns field definitions for a model.
   */
  async fieldsGet(
    model: string,
    attributes?: string[],
    context?: OdooContext,
  ): Promise<OdooFieldsGet> {
    return this.callKw<OdooFieldsGet>(
      model,
      "fields_get",
      attributes ? [attributes] : [[]],
      { context: this.mergeContext(context) },
    );
  }

  /**
   * Calls any public model method directly.
   * Use this for custom methods not covered by the CRUD helpers.
   */
  async callMethod<T = unknown>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {},
    context?: OdooContext,
  ): Promise<T> {
    return this.callKw<T>(model, method, args, {
      ...kwargs,
      context: this.mergeContext(context),
    });
  }

  // ─── Pagination helper ────────────────────────────────────────────────────

  /**
   * Iterates all records matching the domain in pages of `pageSize`.
   * Yields each page as an array. Useful for bulk processing.
   *
   * @example
   * for await (const page of orm.paginate('res.partner', [], { fields: ['name'] })) {
   *   await processPartners(page);
   * }
   */
  async *paginate<T extends OdooRecord = OdooRecord>(
    model: string,
    domain: OdooDomain = [],
    options: SearchReadOptions & { pageSize?: number } = {},
  ): AsyncGenerator<T[], void, unknown> {
    const pageSize = options.pageSize ?? 100;
    let offset = options.offset ?? 0;

    while (true) {
      const records = await this.searchRead<T>(model, domain, {
        ...options,
        limit: pageSize,
        offset,
      });

      if (records.length === 0) break;
      yield records;
      if (records.length < pageSize) break;
      offset += pageSize;
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private callKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    if (this.config.protocol === "xmlrpc") {
      return this.xmlRpcExecuteKw<T>(model, method, args, kwargs);
    }
    return this.jsonRpc.callKw<T>(model, method, args, kwargs);
  }

  private async xmlRpcExecuteKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const session = this.auth.requireSession();
    return this.xmlRpc.executeKw<T & XmlRpcValue>(
      this.config.db,
      session.uid,
      this.config.password ?? this.config.apiKey ?? "",
      model,
      method,
      args as XmlRpcValue[],
      kwargs as Record<string, XmlRpcValue>,
    ) as Promise<T>;
  }

  private mergeContext(ctx?: OdooContext): OdooContext {
    return { ...this.defaultContext, ...ctx };
  }
}
