// ─── JSON-RPC 2.0 ────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: "call";
  id: number;
  params: JsonRpcParams;
}

export interface JsonRpcParams {
  service?: string;
  method?: string;
  args?: unknown[];
  kwargs?: Record<string, unknown>;
  model?: string;
  [key: string]: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: JsonRpcErrorData;
}

export interface JsonRpcErrorData {
  name: string;
  debug: string;
  message: string;
  arguments: unknown[];
  exception_type: string;
  context?: Record<string, unknown>;
}

// ─── XML-RPC (Odoo-specific) ─────────────────────────────────────────────────

export interface XmlRpcCommonResponse {
  server_version: string;
  server_version_info: [number, number, number, string, number, string];
  server_serie: string;
  protocol_version: number;
}

// ─── Session Authenticate ────────────────────────────────────────────────────

export interface SessionAuthenticateResult {
  uid: number | false;
  session_id: string;
  db: string;
  username: string;
  name: string;
  partner_id: [number, string];
  is_admin: boolean;
  is_internal_user: boolean;
  partner_display_name: string;
  user_context: Record<string, unknown>;
  web_client_data?: unknown;
}

// ─── Dataset / ORM responses ─────────────────────────────────────────────────

export interface SearchReadResult<T = Record<string, unknown>> {
  records: T[];
  length: number;
}

export interface FieldsGetResult {
  [field: string]: {
    type: string;
    string: string;
    required?: boolean;
    readonly?: boolean;
    store?: boolean;
    relation?: string;
    selection?: [string, string][];
  };
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface ReportActionResult {
  type: string;
  report_type: string;
  report_name: string;
  report_file?: string;
  data?: unknown;
  context?: Record<string, unknown>;
}
