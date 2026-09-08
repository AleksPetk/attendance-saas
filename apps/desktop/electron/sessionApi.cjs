/**
 * Main-process Django session + CSRF proxy for the desktop app.
 * Keeps checkstation_sessionid / csrftoken out of renderer localStorage.
 */

const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const SESSION_COOKIE = "checkstation_sessionid";
const CSRF_COOKIE = "checkstation_csrftoken";

const SESSION_EXPIRY_EXEMPT_PREFIXES = [
  "/auth/login/",
  "/auth/staff-login/",
  "/auth/register/",
  "/auth/csrf/",
  "/auth/forgot-password/",
  "/auth/reset-password/",
  "/auth/recover-account/",
  "/auth/verify-email/",
  "/auth/verify-backup-email/",
  "/auth/verify-primary-email/",
  "/auth/resend-verification/",
  "/auth/owner-2fa/challenge/",
  "/auth/google/",
  "/auth/apple/",
  "/contact/",
  "/billing/catalog/",
];

function defaultApiBaseUrl() {
  if (process.env.VITE_API_BASE_URL) {
    return normalizeApiBase(process.env.VITE_API_BASE_URL);
  }
  return app.isPackaged
    ? "https://workspace.checkstation.app/api"
    : "http://localhost:8000/api";
}

function normalizeApiBase(raw) {
  const trimmed = String(raw || "").trim().replace(/\/$/, "");
  if (!trimmed) throw new Error("apiBaseUrl required");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function csrfOriginFromApiBase(apiBaseUrl) {
  const trimmed = apiBaseUrl.replace(/\/$/, "");
  const withoutApi = trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
  try {
    return new URL(withoutApi || trimmed).origin;
  } catch {
    return withoutApi || trimmed;
  }
}

function joinUrl(apiBaseUrl, requestPath) {
  const base = apiBaseUrl.replace(/\/$/, "");
  const p = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  return `${base}${p}`;
}

function resolveRequestUrl(apiBaseUrl, requestPath, allowedOrigin) {
  const value = String(requestPath || "");
  if (!/^https?:\/\//i.test(value)) return joinUrl(apiBaseUrl, value);
  const parsed = new URL(value);
  if (parsed.origin !== allowedOrigin) {
    throw new Error("External API URLs are not allowed");
  }
  return parsed.toString();
}

function parseSetCookie(header) {
  const parts = header.split(";").map((p) => p.trim());
  if (!parts[0]) return null;
  const eq = parts[0].indexOf("=");
  if (eq <= 0) return null;
  const name = parts[0].slice(0, eq).trim();
  const value = parts[0].slice(eq + 1).trim();
  const cookie = { name, value, path: "/", expires: null };
  for (const part of parts.slice(1)) {
    const [k, v] = part.split("=").map((s) => s.trim());
    const key = (k || "").toLowerCase();
    if (key === "max-age" && v) {
      const seconds = Number(v);
      if (Number.isFinite(seconds)) cookie.expires = Date.now() + seconds * 1000;
    }
    if (key === "expires" && v) {
      const t = Date.parse(v);
      cookie.expires = Number.isFinite(t) ? t : null;
    }
  }
  return cookie;
}

function shouldAttachCsrf(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function isMissingCredentials(status, data) {
  if (status !== 401 && status !== 403) return false;
  const detail = data && typeof data === "object" ? data.detail : null;
  return (
    detail === "Authentication credentials were not provided."
    || (data && data.code === "not_authenticated")
  );
}

function createSessionApi(options = {}) {
  const apiBaseUrl = normalizeApiBase(options.apiBaseUrl || defaultApiBaseUrl());
  const csrfOrigin = csrfOriginFromApiBase(apiBaseUrl);
  const requestTimeoutMs = options.requestTimeoutMs || 30_000;
  /** @type {Map<string, {name:string,value:string,expires:number|null}>} */
  const cookies = new Map();
  let csrfEnsured = false;
  let hydrated = false;

  function jarFilePath() {
    return path.join(app.getPath("userData"), "checkstation-session.bin");
  }

  function cookieHeader() {
    const now = Date.now();
    const parts = [];
    for (const c of cookies.values()) {
      if (c.expires != null && c.expires <= now) continue;
      parts.push(`${c.name}=${c.value}`);
    }
    return parts.join("; ");
  }

  function getCookie(name) {
    const c = cookies.get(name);
    if (!c) return "";
    if (c.expires != null && c.expires <= Date.now()) {
      cookies.delete(name);
      return "";
    }
    return c.value;
  }

  function setCookie(name, value) {
    if (!value) {
      cookies.delete(name);
      return;
    }
    cookies.set(name, { name, value, expires: null });
  }

  function absorbSetCookies(headers) {
    const list =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : headers.get("set-cookie")
          ? [headers.get("set-cookie")]
          : [];
    const now = Date.now();
    for (const header of list) {
      const parsed = parseSetCookie(header);
      if (!parsed) continue;
      if (parsed.expires != null && parsed.expires <= now) {
        cookies.delete(parsed.name);
        continue;
      }
      cookies.set(parsed.name, parsed);
    }
  }

  function absorbCsrfFromBody(data) {
    if (data && typeof data === "object" && typeof data.csrfToken === "string" && data.csrfToken) {
      setCookie(CSRF_COOKIE, data.csrfToken);
      return true;
    }
    return false;
  }

  function persist() {
    const payload = JSON.stringify([...cookies.values()]);
    const file = jarFilePath();
    try {
      if (safeStorage.isEncryptionAvailable()) {
        fs.writeFileSync(file, safeStorage.encryptString(payload));
      } else {
        // Fallback: still keep out of renderer; file is under Electron userData.
        fs.writeFileSync(file, Buffer.from(payload, "utf8"));
      }
    } catch {
      /* ignore persist failures */
    }
  }

  function loadPersisted() {
    const file = jarFilePath();
    if (!fs.existsSync(file)) return;
    try {
      const buf = fs.readFileSync(file);
      let raw;
      if (safeStorage.isEncryptionAvailable()) {
        try {
          raw = safeStorage.decryptString(buf);
        } catch {
          raw = buf.toString("utf8");
        }
      } else {
        raw = buf.toString("utf8");
      }
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      const now = Date.now();
      cookies.clear();
      for (const c of list) {
        if (!c?.name || c.value == null) continue;
        if (c.expires != null && c.expires <= now) continue;
        cookies.set(c.name, {
          name: c.name,
          value: String(c.value),
          expires: c.expires ?? null,
        });
      }
    } catch {
      /* ignore corrupt jar */
    }
  }

  async function clearSession() {
    cookies.clear();
    csrfEnsured = false;
    try {
      const file = jarFilePath();
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }

  async function initSession() {
    if (!hydrated) {
      loadPersisted();
      hydrated = true;
    }
  }

  async function ensureCsrf() {
    const existing = getCookie(CSRF_COOKIE);
    if (existing && csrfEnsured) return existing;
    await http({ path: "/auth/csrf/", method: "GET", credentials: true });
    csrfEnsured = true;
    return getCookie(CSRF_COOKIE);
  }

  async function http(req) {
    await initSession();
    const method = String(req.method || "GET").toUpperCase();
    const useCredentials = req.credentials !== false;
    const requestPath = req.path;

    if (useCredentials && shouldAttachCsrf(method)) {
      await ensureCsrf();
    }

    const headers = {
      Accept: "application/json",
      Origin: csrfOrigin,
      Referer: `${csrfOrigin}/`,
    };
    const cookie = cookieHeader();
    if (useCredentials && cookie) headers.Cookie = cookie;
    if (useCredentials && shouldAttachCsrf(method)) {
      const csrf = getCookie(CSRF_COOKIE);
      if (csrf) headers["X-CSRFToken"] = csrf;
    }

    let body;
    if (Array.isArray(req.formData)) {
      body = new FormData();
      for (const entry of req.formData) {
        if (!entry || !entry.name) continue;
        if (entry.kind === "file") {
          const bytes = Buffer.from(String(entry.value || ""), "base64");
          body.append(entry.name, new Blob([bytes], { type: entry.type || "application/octet-stream" }), entry.filename || "upload");
        } else {
          body.append(entry.name, String(entry.value ?? ""));
        }
      }
    } else if (req.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(req.json);
    }

    const timeoutMs = req.timeoutMs || requestTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let url;
    try {
      url = resolveRequestUrl(apiBaseUrl, requestPath, csrfOrigin);
    } catch (err) {
      return {
        ok: false,
        status: 0,
        data: { detail: err instanceof Error ? err.message : "Invalid API URL" },
        path: requestPath,
        method,
      };
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      return {
        ok: false,
        status: 0,
        data: { detail: err instanceof Error ? err.message : "Network request failed" },
        path: requestPath,
        method,
      };
    } finally {
      clearTimeout(timer);
    }

    absorbSetCookies(response.headers);

    let data = null;
    const contentType = response.headers.get("content-type") || "";
    if (req.responseType === "base64" && response.ok) {
      data = {
        base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
        contentType,
        contentDisposition: response.headers.get("content-disposition") || "",
      };
    } else if (response.status !== 204) {
      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        try {
          data = await response.text();
        } catch {
          data = null;
        }
      }
    }
    absorbCsrfFromBody(data);
    persist();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        path: requestPath,
        method,
      };
    }

    return {
      ok: true,
      status: response.status,
      data,
    };
  }

  return {
    apiBaseUrl,
    initSession,
    clearSession,
    http,
    // test helpers
    _getCookie: getCookie,
    _SESSION_COOKIE: SESSION_COOKIE,
    _CSRF_COOKIE: CSRF_COOKIE,
    _isMissingCredentials: isMissingCredentials,
    _SESSION_EXPIRY_EXEMPT_PREFIXES: SESSION_EXPIRY_EXEMPT_PREFIXES,
  };
}

module.exports = { createSessionApi, defaultApiBaseUrl, csrfOriginFromApiBase, resolveRequestUrl };
