import { describe, it, expect, vi } from "vitest";

import {
  OdooAuthenticationError,
  OdooNetworkError,
  createOdooError,
  OdooRpcError,
  OdooValidationError,
  OdooAccessError,
} from "../../src/errors/odoo.errors.js";
import { withRetry } from "../../src/utils/retry.js";

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

describe("createOdooError", () => {
  it("maps AccessDenied to OdooAuthenticationError", () => {
    const err = createOdooError(100, "Access denied", {
      exception_type: "odoo.exceptions.AccessDenied",
      message: "Wrong login/password",
      name: "odoo.exceptions.AccessDenied",
      debug: "",
      arguments: [],
    });
    expect(err).toBeInstanceOf(OdooAuthenticationError);
  });

  it("maps AccessError to OdooAccessError", () => {
    const err = createOdooError(200, "Access error", {
      exception_type: "odoo.exceptions.AccessError",
      message: "No access rights",
      name: "odoo.exceptions.AccessError",
      debug: "",
      arguments: [],
    });
    expect(err).toBeInstanceOf(OdooAccessError);
  });

  it("maps ValidationError to OdooValidationError", () => {
    const err = createOdooError(200, "Validation", {
      exception_type: "odoo.exceptions.ValidationError",
      message: "Field is required",
      name: "odoo.exceptions.ValidationError",
      debug: "",
      arguments: [],
    });
    expect(err).toBeInstanceOf(OdooValidationError);
  });

  it("defaults to OdooRpcError for unknown exception types", () => {
    const err = createOdooError(500, "Server error", {
      exception_type: "some.unknown.Exception",
      message: "Boom",
      name: "some.unknown.Exception",
      debug: "",
      arguments: [],
    });
    expect(err).toBeInstanceOf(OdooRpcError);
  });
});
