/**
 * Minimal XML-RPC serialiser/deserialiser for Odoo's xmlrpc/2/* endpoints.
 * Handles the subset of types that Odoo actually uses:
 * int, boolean, string, double, array, struct, base64, nil/false.
 *
 * No third-party deps — uses the native `DOMParser` / `XMLSerializer` shim
 * provided by the runtime, or falls back to string building for server-side.
 */

export type XmlRpcValue =
  | string
  | number
  | boolean
  | null
  | XmlRpcValue[]
  | XmlRpcStruct;

export type XmlRpcStruct = { [key: string]: XmlRpcValue };

// ─── Serialise (JS → XML string) ─────────────────────────────────────────────

export function serialiseXmlRpc(method: string, params: XmlRpcValue[]): string {
  return (
    `<?xml version="1.0"?>` +
    `<methodCall>` +
    `<methodName>${escapeXml(method)}</methodName>` +
    `<params>${params.map((p) => `<param>${valueToXml(p)}</param>`).join("")}</params>` +
    `</methodCall>`
  );
}

function valueToXml(v: XmlRpcValue): string {
  if (v === null || v === false) return `<value><boolean>0</boolean></value>`;
  if (typeof v === "boolean")
    return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? `<value><int>${v}</int></value>`
      : `<value><double>${v}</double></value>`;
  }
  if (typeof v === "string")
    return `<value><string>${escapeXml(v)}</string></value>`;
  if (Array.isArray(v)) {
    return `<value><array><data>${v.map(valueToXml).join("")}</data></array></value>`;
  }
  if (typeof v === "object") {
    const members = Object.entries(v)
      .map(
        ([k, val]) =>
          `<member><name>${escapeXml(k)}</name>${valueToXml(val)}</member>`,
      )
      .join("");
    return `<value><struct>${members}</struct></value>`;
  }
  throw new Error(`XML-RPC: unserialisable value type: ${typeof v}`);
}

// ─── Deserialise (XML string → JS) ───────────────────────────────────────────

export async function deserialiseXmlRpc(xml: string): Promise<XmlRpcValue> {
  // Trim the XML declaration to help parsers that choke on it
  const cleaned = xml.replace(/<\?xml[^?]*\?>\s*/i, "").trim();

  // Parse using DOMParser (available in browser + modern Node via undici/fetch)
  const doc = await parseXml(cleaned);

  // Check for fault
  const fault = doc.querySelector("fault");
  if (fault) {
    const faultValue = parseValue(fault.querySelector("value")!);
    const f = faultValue as { faultCode?: number; faultString?: string };
    throw Object.assign(new Error(f.faultString ?? "XML-RPC fault"), {
      code: f.faultCode ?? -1,
    });
  }

  const firstParam = doc.querySelector("params > param > value");
  if (!firstParam) throw new Error("XML-RPC: empty response");
  return parseValue(firstParam);
}

function parseValue(el: Element): XmlRpcValue {
  const child = el.firstElementChild;

  // Bare text node = implicit string
  if (!child) return el.textContent ?? "";

  switch (child.tagName.toLowerCase()) {
    case "string":
      return child.textContent ?? "";
    case "int":
    case "i4":
    case "i8":
      return parseInt(child.textContent ?? "0", 10);
    case "double":
      return parseFloat(child.textContent ?? "0");
    case "boolean":
      return child.textContent?.trim() === "1";
    case "nil":
      return null;
    case "base64":
      return child.textContent?.trim() ?? "";
    case "array": {
      const data = child.querySelector("data");
      if (!data) return [];
      return Array.from(data.children)
        .filter((c) => c.tagName.toLowerCase() === "value")
        .map(parseValue);
    }
    case "struct": {
      const result: XmlRpcStruct = {};
      Array.from(child.children).forEach((member) => {
        if (member.tagName.toLowerCase() !== "member") return;
        const name = member.querySelector("name")?.textContent ?? "";
        const valueEl = member.querySelector("value");
        result[name] = valueEl ? parseValue(valueEl) : null;
      });
      return result;
    }
    default:
      return child.textContent ?? "";
  }
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

let _nodeXmlParser: ((xml: string) => Document) | null = null;

/**
 * Allow users to inject a DOMParser for environments without one.
 * e.g. `setXmlParser((xml) => new DOMParser().parseFromString(xml, 'application/xml'))`
 */
export function setXmlParser(parser: (xml: string) => Document): void {
  _nodeXmlParser = parser;
}

async function ensureXmlParser(): Promise<(xml: string) => Document> {
  if (_nodeXmlParser) return _nodeXmlParser;

  // Browser environment
  if (typeof DOMParser !== "undefined") {
    _nodeXmlParser = (xml: string) =>
      new DOMParser().parseFromString(xml, "application/xml");
    return _nodeXmlParser;
  }

  // Node.js: try jsdom
  try {
    const { JSDOM } = await import("jsdom");
    _nodeXmlParser = (xml: string) => {
      const dom = new JSDOM(xml, { contentType: "application/xml" });
      return dom.window.document as unknown as Document;
    };
    return _nodeXmlParser;
  } catch {
    // jsdom not installed — no-op, fall through
  }

  throw new Error(
    'No XML parser available. Install "jsdom" (`npm i jsdom`) for Node.js XML-RPC support, ' +
      "or call setXmlParser() with a custom DOMParser before use.",
  );
}

function parseXml(xml: string): Promise<Document> {
  return ensureXmlParser().then((parse) => parse(xml));
}
