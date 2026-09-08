import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CookieJar,
  MemoryCookieStorage,
  csrfOriginFromApiBase,
  CSRF_COOKIE,
} from "./cookies.js";
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

  it("sets CSRF from JSON body helper path", () => {
    const jar = new CookieJar();
    jar.set(CSRF_COOKIE, "from-json");
    assert.equal(jar.get(CSRF_COOKIE), "from-json");
  });

  it("keeps both cookies when a native Headers polyfill comma-joins Set-Cookie", () => {
    const jar = new CookieJar();
    jar.absorbSetCookieHeaders([
      "checkstation_csrftoken=rotated; expires=Wed, 08 Sep 2027 00:00:00 GMT; Path=/; Secure, checkstation_sessionid=session-1; Path=/; HttpOnly; Secure",
    ]);
    assert.equal(jar.get(CSRF_COOKIE), "rotated");
    assert.equal(jar.get("checkstation_sessionid"), "session-1");
  });

  it("reads duplicate Set-Cookie fields from Expo native raw headers", () => {
    const jar = new CookieJar();
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, "_rawHeaders", {
      value: [
        ["set-cookie", "checkstation_csrftoken=rotated; Path=/; Secure"],
        ["set-cookie", "checkstation_sessionid=session-2; Path=/; HttpOnly; Secure"],
      ],
    });
    jar.absorbFromResponse(response);
    assert.equal(jar.get(CSRF_COOKIE), "rotated");
    assert.equal(jar.get("checkstation_sessionid"), "session-2");
  });
});

describe("csrfOriginFromApiBase", () => {
  it("derives API host origin for Django CSRF Origin header", () => {
    assert.equal(
      csrfOriginFromApiBase("https://workspace.checkstation.app/api"),
      "https://workspace.checkstation.app",
    );
    assert.equal(
      csrfOriginFromApiBase("http://localhost:8000/api"),
      "http://localhost:8000",
    );
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

describe("ApiClient", () => {
  it("builds against normalized api base", () => {
    const config = createAppConfig({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      environment: "production",
    });
    const client = new ApiClient(config);
    assert.equal(client.apiBaseUrl, "https://workspace.checkstation.app/api");
  });

  it("sends Origin/Referer and absorbs csrfToken from JSON body", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      const headers = new Headers({ "content-type": "application/json" });
      return new Response(JSON.stringify({ csrfToken: "token-from-body" }), {
        status: 200,
        headers,
      });
    };
    const config = createAppConfig({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      environment: "production",
    });
    const client = new ApiClient(config, new CookieJar(), { fetchImpl: fakeFetch });
    await client.ensureCsrf();
    assert.equal(client.jar.get(CSRF_COOKIE), "token-from-body");
    const hdrs = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(hdrs.Origin, "https://workspace.checkstation.app");
    assert.equal(hdrs.Referer, "https://workspace.checkstation.app/");
  });

  it("attaches Cookie + X-CSRFToken on mutating requests", async () => {
    const seen: Record<string, string>[] = [];
    const fakeFetch: typeof fetch = async (_input, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const jar = new CookieJar();
    jar.set(CSRF_COOKIE, "csrf-1");
    jar.set("checkstation_sessionid", "sess-1");
    const config = createAppConfig({
      apiBaseUrl: "http://localhost:8000/api",
      environment: "development",
    });
    const client = new ApiClient(config, jar, { fetchImpl: fakeFetch });
    // Pretend CSRF already ensured
    (client as unknown as { csrfEnsured: boolean }).csrfEnsured = true;
    await client.post("/auth/login/", { email: "a@b.c", password: "x" });
    const last = seen[seen.length - 1];
    assert.match(last.Cookie, /checkstation_sessionid=sess-1/);
    assert.equal(last["X-CSRFToken"], "csrf-1");
    assert.equal(last.Origin, "http://localhost:8000");
  });

  it("returns an unconsumed response for authenticated file downloads", async () => {
    const fakeFetch: typeof fetch = async () => new Response("report-data", {
      status: 200,
      headers: {
        "content-disposition": 'attachment; filename="attendance-report.csv"',
        "content-type": "text/csv",
      },
    });
    const config = createAppConfig({
      apiBaseUrl: "https://workspace.checkstation.app/api",
      environment: "production",
    });
    const client = new ApiClient(config, new CookieJar(), { fetchImpl: fakeFetch });
    const response = await client.get<Response>("/history/attendance-report/export/", { rawResponse: true });
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="attendance-report.csv"');
    assert.equal(await response.text(), "report-data");
  });
});
