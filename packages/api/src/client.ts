import type { CheckStationAppConfig } from "@checkstation/config";
import { CookieJar, CSRF_COOKIE } from "./cookies.js";
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
  // apiBaseUrl already ends with /api; path should be like /workspace/ or /auth/login/
  return `${base}${p}`;
}

export class ApiClient {
  readonly jar: CookieJar;
  private csrfEnsured = false;
  private onSessionExpired: SessionExpiredListener | null = null;

  constructor(
    private readonly config: CheckStationAppConfig,
    jar?: CookieJar,
  ) {
    this.jar = jar ?? new CookieJar();
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
    await this.request("/auth/csrf/", { method: "GET", credentials: true });
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
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        // Native clients manage cookies manually; omit browser auto-cookies.
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
      return (await response.json()) as T;
    }
    // Binary exports etc.
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
