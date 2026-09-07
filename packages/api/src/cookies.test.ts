import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookieJar, MemoryCookieStorage } from "./cookies.js";
import {
  ApiError,
  fieldErrorsFromBody,
  isMissingCredentialsError,
} from "./errors.js";
import { createAppConfig } from "@checkstation/config";
import { ApiClient } from "./client.js";

describe("CookieJar", () => {
  it("stores and serializes cookies from Set-Cookie", async () => {
    const jar = new CookieJar(new MemoryCookieStorage());
    jar.absorbSetCookieHeaders([
      "checkstation_csrftoken=abc; Path=/; SameSite=Lax",
      "checkstation_sessionid=sess; Path=/; HttpOnly",
    ]);
    assert.equal(jar.get("checkstation_csrftoken"), "abc");
    assert.match(jar.cookieHeader(), /checkstation_sessionid=sess/);
    await jar.persist();
    const storage = new MemoryCookieStorage();
    // Re-hydrate through a fresh jar using the same cookie values.
    const jar2 = new CookieJar(storage);
    jar2.absorbSetCookieHeaders([
      "checkstation_csrftoken=abc; Path=/",
      "checkstation_sessionid=sess; Path=/",
    ]);
    await jar2.persist();
    const jar3 = new CookieJar(storage);
    await jar3.hydrate();
    assert.equal(jar3.get("checkstation_csrftoken"), "abc");
  });
});

describe("errors", () => {
  it("detects missing credentials", () => {
    const err = new ApiError({
      status: 403,
      data: { detail: "Authentication credentials were not provided." },
      path: "/workspace/",
      method: "GET",
    });
    assert.equal(isMissingCredentialsError(err), true);
  });

  it("extracts field errors", () => {
    const fields = fieldErrorsFromBody({
      email: ["Required"],
      password: ["Too short"],
      detail: "ignored",
    });
    assert.equal(fields.email, "Required");
    assert.equal(fields.password, "Too short");
  });
});

describe("ApiClient config", () => {
  it("builds against normalized api base", () => {
    const config = createAppConfig({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      environment: "production",
    });
    const client = new ApiClient(config);
    assert.equal(client.apiBaseUrl, "https://workspace.checkstation.app/api");
  });
});
