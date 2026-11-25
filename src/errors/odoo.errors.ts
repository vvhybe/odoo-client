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

  /** Odoo server-side exception class, e.g. "odoo.exceptions.AccessDenied" */
  get exceptionType(): string | undefined {
    return this.data?.name || this.data?.exception_type;
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

/** The session cookie is no longer valid: authenticate again. */
export class OdooSessionExpiredError extends OdooAuthenticationError {
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

/** JSON-RPC error code Odoo uses for an expired or invalid session. */
const SESSION_EXPIRED_CODE = 100;

/**
 * Maps a raw JSON-RPC error to the most specific typed OdooError subclass.
 *
 * Odoo 14+ identifies the exception by its class in `data.name`
 * (e.g. "odoo.exceptions.UserError"); `exception_type` is only read as a
 * fallback, since no supported Odoo version sends it.
 */
export function createOdooError(
  rpcCode: number,
  message: string,
  data?: JsonRpcErrorData,
): OdooError {
  const kind = `${data?.name ?? ""} ${data?.exception_type ?? ""}`;
  const serverMessage = data?.message || message;

  if (/AccessDenied|access_denied/.test(kind)) {
    return new OdooAuthenticationError(serverMessage);
  }

  if (rpcCode === SESSION_EXPIRED_CODE || /SessionExpired/.test(kind)) {
    return new OdooSessionExpiredError();
  }

  if (/AccessError|access_error/.test(kind)) {
    return new OdooAccessError(serverMessage);
  }

  if (/MissingError|missing_error/.test(kind)) {
    return new OdooNotFoundError(
      (data?.context?.["model"] as string) ?? "unknown",
      [],
    );
  }

  if (
    /UserError|ValidationError|RedirectWarning|user_error|validation_error/.test(
      kind,
    )
  ) {
    return new OdooValidationError(serverMessage);
  }

  return new OdooRpcError(serverMessage, rpcCode, data);
}

/** XML-RPC fault codes of Odoo's `/xmlrpc/2/*` endpoints. */
const FAULT_USER_ERROR = 2;
const FAULT_ACCESS_DENIED = 3;
const FAULT_ACCESS_ERROR = 4;

/**
 * Maps an XML-RPC fault to the most specific typed OdooError subclass.
 *
 * Odoo answers `UserError` (and its `ValidationError` / `RedirectWarning`
 * subclasses) with fault code 2, `AccessDenied` with 3, `AccessError` with 4,
 * and anything else with 1 and the traceback as the fault string.
 */
export function createOdooFaultError(
  faultCode: number | string,
  faultString: string,
): OdooError {
  switch (faultCode) {
    case FAULT_ACCESS_DENIED:
      return new OdooAuthenticationError(faultString);
    case FAULT_ACCESS_ERROR:
      return new OdooAccessError(faultString);
    case FAULT_USER_ERROR:
      return new OdooValidationError(faultString);
  }
  // The traceback's last line reads "<ExceptionClass>: <message>".
  const lastLine = faultString.trim().split("\n").pop()?.trim() ?? "";
  const exceptionClass = /^([\w.]+):/.exec(lastLine)?.[1] ?? "";
  return new OdooRpcError(
    lastLine || "XML-RPC fault",
    typeof faultCode === "number" ? faultCode : -1,
    {
      name: exceptionClass,
      debug: faultString,
      message: lastLine,
      arguments: [],
    },
  );
}
