import { describe, it, expect, vi } from "vitest";

import {
  OdooAuthenticationError,
  OdooNetworkError,
  OdooTimeoutError,
  OdooSessionExpiredError,
  OdooNotFoundError,
  createOdooError,
  createOdooFaultError,
  OdooRpcError,
  OdooValidationError,
  OdooAccessError,
} from "../../src/errors/odoo.errors.js";
import { isReadMethod, safeFetch, withRetry } from "../../src/utils/retry.js";

/** Error `data` as Odoo 14–19 send it: the class in `name`, no `exception_type`. */
function odooData(name: string, message: string) {
  return {
    name,
    message,
    debug: "Traceback…",
    arguments: [message],
    context: {},
  };
}

describe("withRetry", () => {
  const opts = { retries: 3, retryDelay: 10 };

  it("resolves immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn, opts)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on network error and eventually resolves", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new OdooNetworkError("timeout"))
      .mockRejectedValueOnce(new OdooNetworkError("timeout"))
      .mockResolvedValue("ok");

    expect(await withRetry(fn, opts)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry OdooAuthenticationError", async () => {
    const fn = vi.fn().mockRejectedValue(new OdooAuthenticationError());

    await expect(withRetry(fn, opts)).rejects.toBeInstanceOf(
      OdooAuthenticationError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on timeout", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new OdooTimeoutError(10))
      .mockResolvedValue("ok");

    expect(await withRetry(fn, opts)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["OdooValidationError", new OdooValidationError("Refused")],
    ["OdooAccessError", new OdooAccessError("No access")],
    ["OdooRpcError", new OdooRpcError("Boom", 200)],
    ["a plain Error", new Error("Unexpected")],
  ])("does NOT retry %s (Odoo already answered)", async (_label, error) => {
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, opts)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry at all with retries: 0", async () => {
    const fn = vi.fn().mockRejectedValue(new OdooNetworkError("down"));

    await expect(withRetry(fn, { ...opts, retries: 0 })).rejects.toBeInstanceOf(
      OdooNetworkError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new OdooNetworkError("down"));

    await expect(withRetry(fn, opts)).rejects.toBeInstanceOf(OdooNetworkError);
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("calls onRetry callback on each retry", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new OdooNetworkError("a"))
      .mockResolvedValue("ok");

    await withRetry(fn, { ...opts, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(OdooNetworkError));
  });
});

describe("isReadMethod", () => {
  it.each([
    "search_read",
    "read",
    "search_count",
    "web_search_read",
    "fields_get",
  ])("treats %s as a read", (method) =>
    expect(isReadMethod(method)).toBe(true),
  );

  it.each(["create", "write", "unlink", "action_confirm", "my_custom_method"])(
    "treats %s as a call that may change data",
    (method) => expect(isReadMethod(method)).toBe(false),
  );
});

describe("createOdooError", () => {
  it("maps a wrong login (AccessDenied, code 200) to OdooAuthenticationError", () => {
    const err = createOdooError(
      200,
      "Odoo Server Error",
      odooData("odoo.exceptions.AccessDenied", "Access Denied"),
    );
    expect(err).toBeInstanceOf(OdooAuthenticationError);
    expect(err).not.toBeInstanceOf(OdooSessionExpiredError);
    expect(err.message).toBe("Access Denied");
  });

  it("maps an expired session (code 100) to OdooSessionExpiredError", () => {
    const err = createOdooError(
      100,
      "Odoo Session Expired",
      odooData("odoo.http.SessionExpiredException", "Session expired"),
    );
    expect(err).toBeInstanceOf(OdooSessionExpiredError);
    expect(err).toBeInstanceOf(OdooAuthenticationError);
  });

  it("maps AccessError to OdooAccessError", () => {
    const err = createOdooError(
      200,
      "Odoo Server Error",
      odooData(
        "odoo.exceptions.AccessError",
        "You are not allowed to modify 'Contact'",
      ),
    );
    expect(err).toBeInstanceOf(OdooAccessError);
    expect(err.message).toBe("You are not allowed to modify 'Contact'");
  });

  it.each(["odoo.exceptions.UserError", "odoo.exceptions.ValidationError"])(
    "maps %s to OdooValidationError with the server message",
    (name) => {
      const err = createOdooError(
        200,
        "Odoo Server Error",
        odooData(name, "Refused"),
      );
      expect(err).toBeInstanceOf(OdooValidationError);
      expect(err.message).toBe("Refused");
    },
  );

  it("maps MissingError to OdooNotFoundError", () => {
    const err = createOdooError(
      200,
      "Odoo Server Error",
      odooData("odoo.exceptions.MissingError", "Record does not exist"),
    );
    expect(err).toBeInstanceOf(OdooNotFoundError);
  });

  it("still reads the legacy exception_type when a server sends it", () => {
    const err = createOdooError(200, "Odoo Server Error", {
      ...odooData("", "Refused"),
      exception_type: "user_error",
    });
    expect(err).toBeInstanceOf(OdooValidationError);
  });

  it("defaults to OdooRpcError and keeps the exception class", () => {
    const err = createOdooError(
      200,
      "Odoo Server Error",
      odooData("builtins.ValueError", "Boom"),
    );
    expect(err).toBeInstanceOf(OdooRpcError);
    expect((err as OdooRpcError).exceptionType).toBe("builtins.ValueError");
    expect((err as OdooRpcError).debug).toBe("Traceback…");
  });
});

describe("createOdooFaultError", () => {
  it.each([
    [2, OdooValidationError],
    [3, OdooAuthenticationError],
    [4, OdooAccessError],
  ])("maps fault code %i", (code, Cls) => {
    const err = createOdooFaultError(code, "Refused");
    expect(err).toBeInstanceOf(Cls);
    expect(err.message).toBe("Refused");
  });

  it("maps other faults to OdooRpcError with the traceback's last line", () => {
    const traceback =
      'Traceback (most recent call last):\n  File "x.py", line 1\n' +
      "AttributeError: The method 'res.partner.nope' does not exist\n";
    const err = createOdooFaultError(1, traceback) as OdooRpcError;
    expect(err).toBeInstanceOf(OdooRpcError);
    expect(err.message).toBe(
      "AttributeError: The method 'res.partner.nope' does not exist",
    );
    expect(err.exceptionType).toBe("AttributeError");
    expect(err.debug).toBe(traceback);
  });
});

describe("safeFetch", () => {
  it("hides URL credentials in its error message", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(
        new TypeError(
          "Request cannot be constructed from a URL that includes credentials: http://u:s3cret@o/web",
        ),
      );
    try {
      const error = await safeFetch("http://u:s3cret@o/web", {}, 1000).catch(
        (e: unknown) => e as Error,
      );
      expect(error).toBeInstanceOf(OdooNetworkError);
      expect((error as Error).message).not.toContain("s3cret");
      expect((error as Error).message).toContain("http://***@o/web");
    } finally {
      globalThis.fetch = original;
    }
  });
});
