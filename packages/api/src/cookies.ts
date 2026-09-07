/**
 * In-memory cookie jar for native/desktop clients talking to Django session auth.
 * Mirrors SPA cookie + CSRF behavior without embedding secrets.
 */

export type StoredCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expires?: number | null;
};

export type CookieJarStorage = {
  load(): Promise<StoredCookie[]>;
  save(cookies: StoredCookie[]): Promise<void>;
  clear(): Promise<void>;
};

export class MemoryCookieStorage implements CookieJarStorage {
  private cookies: StoredCookie[] = [];

  async load(): Promise<StoredCookie[]> {
    return [...this.cookies];
  }

  async save(cookies: StoredCookie[]): Promise<void> {
    this.cookies = [...cookies];
  }

  async clear(): Promise<void> {
    this.cookies = [];
  }
}

function parseSetCookie(header: string): StoredCookie | null {
  const parts = header.split(";").map((p) => p.trim());
  if (!parts[0]) return null;
  const eq = parts[0].indexOf("=");
  if (eq <= 0) return null;
  const name = parts[0].slice(0, eq).trim();
  const value = parts[0].slice(eq + 1).trim();
  const cookie: StoredCookie = { name, value, path: "/" };
  for (const part of parts.slice(1)) {
    const [k, v] = part.split("=").map((s) => s.trim());
    const key = (k || "").toLowerCase();
    if (key === "path" && v) cookie.path = v;
    if (key === "domain" && v) cookie.domain = v;
    if (key === "secure") cookie.secure = true;
    if (key === "httponly") cookie.httpOnly = true;
    if (key === "expires" && v) {
      const t = Date.parse(v);
      cookie.expires = Number.isFinite(t) ? t : null;
    }
    if (key === "max-age" && v) {
      const seconds = Number(v);
      if (Number.isFinite(seconds)) {
        cookie.expires = Date.now() + seconds * 1000;
      }
    }
  }
  return cookie;
}

export class CookieJar {
  private cookies: StoredCookie[] = [];

  constructor(private readonly storage: CookieJarStorage = new MemoryCookieStorage()) {}

  async hydrate(): Promise<void> {
    const loaded = await this.storage.load();
    const now = Date.now();
    this.cookies = loaded.filter((c) => c.expires == null || c.expires > now);
  }

  async persist(): Promise<void> {
    await this.storage.save(this.cookies);
  }

  async clear(): Promise<void> {
    this.cookies = [];
    await this.storage.clear();
  }

  get(name: string): string {
    const hit = this.cookies.find((c) => c.name === name);
    return hit?.value ?? "";
  }

  cookieHeader(): string {
    const now = Date.now();
    return this.cookies
      .filter((c) => c.expires == null || c.expires > now)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  absorbSetCookieHeaders(headers: string[]): void {
    const now = Date.now();
    for (const header of headers) {
      const parsed = parseSetCookie(header);
      if (!parsed) continue;
      this.cookies = this.cookies.filter((c) => c.name !== parsed.name);
      if (parsed.expires != null && parsed.expires <= now) continue;
      this.cookies.push(parsed);
    }
  }

  /** Collect Set-Cookie from Fetch Headers (single or getSetCookie). */
  absorbFromResponseHeaders(headers: Headers): void {
    const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === "function") {
      this.absorbSetCookieHeaders(anyHeaders.getSetCookie());
      return;
    }
    const single = headers.get("set-cookie");
    if (single) this.absorbSetCookieHeaders([single]);
  }
}

export const SESSION_COOKIE = "checkstation_sessionid";
export const CSRF_COOKIE = "checkstation_csrftoken";
