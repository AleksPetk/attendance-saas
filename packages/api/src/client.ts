import type { CheckStationAppConfig } from "@checkstation/config";
import { CookieJar, CSRF_COOKIE, csrfOriginFromApiBase } from "./cookies.js";
import {
  ApiError,
  NetworkError,
  TimeoutError,
  isMissingCredentialsError,
  parseErrorBody,
} from "./errors.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type RequestOptions = {
  method?: HttpMethod;
  json?: unknown;
  formData?: FormData;
  /** Default true — attach cookies. Use false for anonymous public endpoints. */
  credentials?: boolean;
  signal?: AbortSignal;
  /** Override timeout ms. */
  timeoutMs?: number;
};

export type SessionExpiredListener = (path: string) => void;

export type ApiFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type ApiClientOptions = {
  /** Override fetch (e.g. expo/fetch for Set-Cookie visibility on native). */
  fetchImpl?: ApiFetch;
  /**
   * Origin/Referer sent so Django CSRF origin checks pass without a browser.
   * Defaults to the API host origin (accepted by Django as good_origin).
   */
  csrfOrigin?: string;
};

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

function shouldAttachCsrf(method: string): boolean {
  const m = method.toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(m);
}

function joinUrl(apiBaseUrl: string, path: string): string {
  const base = apiBaseUrl.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function absorbCsrfFromJsonBody(jar: CookieJar, data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const token = (data as { csrfToken?: unknown }).csrfToken;
  if (typeof token !== "string" || !token) return false;
  jar.set(CSRF_COOKIE, token);
  return true;
}

export class ApiClient {
  readonly jar: CookieJar;
  private csrfEnsured = false;
  private onSessionExpired: SessionExpiredListener | null = null;
  private readonly fetchImpl: ApiFetch;
  private readonly csrfOrigin: string;

  constructor(
    private readonly config: CheckStationAppConfig,
    jar?: CookieJar,
    options: ApiClientOptions = {},
  ) {
    this.jar = jar ?? new CookieJar();
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.csrfOrigin = options.csrfOrigin ?? csrfOriginFromApiBase(config.apiBaseUrl);
  }

  setSessionExpiredListener(listener: SessionExpiredListener | null): void {
    this.onSessionExpired = listener;
  }

  get apiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  async init(): Promise<void> {
    await this.jar.hydrate();
  }

  async ensureCsrf(): Promise<string> {
    const existing = this.jar.get(CSRF_COOKIE);
    if (existing && this.csrfEnsured) return existing;
    await this.request<{ csrfToken?: string }>("/auth/csrf/", {
      method: "GET",
      credentials: true,
    });
    this.csrfEnsured = true;
    return this.jar.get(CSRF_COOKIE);
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = (options.method || "GET").toUpperCase() as HttpMethod;
    const useCredentials = options.credentials !== false;

    if (useCredentials && shouldAttachCsrf(method)) {
      await this.ensureCsrf();
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      // Django 5 CSRF: when Origin is present it is verified against the API host
      // or CSRF_TRUSTED_ORIGINS. Native/Electron have no browser origin otherwise.
      Origin: this.csrfOrigin,
      Referer: `${this.csrfOrigin}/`,
    };
    const cookieHeader = this.jar.cookieHeader();
    if (useCredentials && cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    if (useCredentials && shouldAttachCsrf(method)) {
      const csrf = this.jar.get(CSRF_COOKIE);
      if (csrf) headers["X-CSRFToken"] = csrf;
    }

    let body: BodyInit | undefined;
    if (options.formData) {
      body = options.formData;
    } else if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.json);
    }

    const timeoutMs = options.timeoutMs ?? this.config.requestTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    const url = joinUrl(this.config.apiBaseUrl, path);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        // Native/desktop manage cookies manually; omit browser auto-cookies.
        credentials: "omit",
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new TimeoutError();
      }
      throw new NetworkError("Network request failed", err);
    } finally {
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
    }

    this.jar.absorbFromResponseHeaders(response.headers);
    await this.jar.persist();

    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      const data = await parseErrorBody(response);
      absorbCsrfFromJsonBody(this.jar, data);
      await this.jar.persist();
      const error = new ApiError({
        status: response.status,
        data,
        path,
        method,
      });
      if (
        useCredentials
        && isMissingCredentialsError(error)
        && !SESSION_EXPIRY_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))
      ) {
        this.onSessionExpired?.(path);
      }
      throw error;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as T;
      if (absorbCsrfFromJsonBody(this.jar, data)) {
        await this.jar.persist();
      }
      return data;
    }
    return (await response.blob()) as T;
  }

  get<T = unknown>(path: string, options?: Omit<RequestOptions, "method" | "json">) {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T = unknown>(path: string, json?: unknown, options?: Omit<RequestOptions, "method" | "json">) {
    return this.request<T>(path, { ...options, method: "POST", json });
  }

  put<T = unknown>(path: string, json?: unknown, options?: Omit<RequestOptions, "method" | "json">) {
    return this.request<T>(path, { ...options, method: "PUT", json });
  }

  patch<T = unknown>(path: string, json?: unknown, options?: Omit<RequestOptions, "method" | "json">) {
    return this.request<T>(path, { ...options, method: "PATCH", json });
  }

  delete<T = unknown>(path: string, options?: Omit<RequestOptions, "method">) {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
}
