import type { JsonRpcErrorData } from "../types/index.js";

// ─── Base ─────────────────────────────────────────────────────────────────────

export class OdooError extends Error {
  constructor(
    message: string,
    public readonly code?: number | string,
  ) {
    super(message);
    this.name = "OdooError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── RPC / Network ───────────────────────────────────────────────────────────

export class OdooRpcError extends OdooError {
  constructor(
    message: string,
    public readonly rpcCode: number,
    public readonly data?: JsonRpcErrorData,
  ) {
    super(message, rpcCode);
    this.name = "OdooRpcError";
  }

  /** Odoo server-side exception type, e.g. "odoo.exceptions.AccessDenied" */
  get exceptionType(): string | undefined {
    return this.data?.exception_type;
  }

  /** Server-side debug traceback */
  get debug(): string | undefined {
    return this.data?.debug;
  }
}

export class OdooNetworkError extends OdooError {
  constructor(
    message: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = "OdooNetworkError";
  }
}

export class OdooTimeoutError extends OdooError {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "OdooTimeoutError";
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export class OdooAuthenticationError extends OdooError {
  constructor(
    message = "Authentication failed — check credentials or API key",
  ) {
    super(message, "AUTH_FAILED");
    this.name = "OdooAuthenticationError";
  }
}

export class OdooSessionExpiredError extends OdooError {
  constructor() {
    super("Session expired — re-authenticate");
    this.name = "OdooSessionExpiredError";
  }
}

// ─── ORM ──────────────────────────────────────────────────────────────────────

export class OdooAccessError extends OdooError {
  constructor(
    message: string,
    public readonly model?: string,
  ) {
    super(message, "ACCESS_ERROR");
    this.name = "OdooAccessError";
  }
}

export class OdooValidationError extends OdooError {
  constructor(
    message: string,
    public readonly fields?: string[],
  ) {
    super(message, "VALIDATION_ERROR");
    this.name = "OdooValidationError";
  }
}

export class OdooNotFoundError extends OdooError {
  constructor(model: string, id: number | number[]) {
    const ids = Array.isArray(id) ? id.join(", ") : id;
    super(`Record(s) not found: ${model}(${ids})`, "NOT_FOUND");
    this.name = "OdooNotFoundError";
  }
}

export class OdooConfigError extends OdooError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "OdooConfigError";
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Maps a raw JSON-RPC error to the most specific typed OdooError subclass.
 */
export function createOdooError(
  rpcCode: number,
  message: string,
  data?: JsonRpcErrorData,
): OdooError {
  const exceptionType = data?.exception_type ?? "";
  const serverMessage = data?.message ?? message;

  if (
    exceptionType.includes("AccessDenied") ||
    exceptionType.includes("access_denied") ||
    rpcCode === 100
  ) {
    return new OdooAuthenticationError(serverMessage);
  }

  if (
    exceptionType.includes("AccessError") ||
    exceptionType.includes("access_error")
  ) {
    return new OdooAccessError(serverMessage);
  }

  if (
    exceptionType.includes("ValidationError") ||
    exceptionType.includes("UserError")
  ) {
    return new OdooValidationError(serverMessage);
  }

  if (exceptionType.includes("MissingError")) {
    return new OdooNotFoundError(
      (data?.context?.["model"] as string) ?? "unknown",
      [],
    );
  }

  return new OdooRpcError(serverMessage, rpcCode, data);
}
