import type { CheckStationAppConfig } from "@checkstation/config";
import type { HttpMethod, RequestOptions, SessionExpiredListener } from "./client.js";
import {
  ApiError,
  isMissingCredentialsError,
} from "./errors.js";

/**
 * IPC / main-process backed API client for Electron.
 * Session cookies and CSRF never enter renderer storage.
 */

export type DesktopHttpRequest = {
  path: string;
  method?: HttpMethod;
  json?: unknown;
  credentials?: boolean;
  timeoutMs?: number;
};

export type DesktopHttpSuccess = {
  ok: true;
  status: number;
  data: unknown;
};

export type DesktopHttpFailure = {
  ok: false;
  status: number;
  data: unknown;
  path: string;
  method: string;
};

export type DesktopHttpResult = DesktopHttpSuccess | DesktopHttpFailure;

export type DesktopSessionBridge = {
  initSession: () => Promise<void>;
  clearSession: () => Promise<void>;
  http: (req: DesktopHttpRequest) => Promise<DesktopHttpResult>;
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

/**
 * Minimal jar facade so AuthController can clear session without seeing cookies.
 */
class RemoteCookieJarFacade {
  constructor(private readonly clearSession: () => Promise<void>) {}

  async clear(): Promise<void> {
    await this.clearSession();
  }
}

export class TransportApiClient {
  readonly jar: RemoteCookieJarFacade;
  private onSessionExpired: SessionExpiredListener | null = null;

  constructor(
    private readonly config: CheckStationAppConfig,
    private readonly bridge: DesktopSessionBridge,
  ) {
    this.jar = new RemoteCookieJarFacade(() => this.bridge.clearSession());
  }

  setSessionExpiredListener(listener: SessionExpiredListener | null): void {
    this.onSessionExpired = listener;
  }

  get apiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  async init(): Promise<void> {
    await this.bridge.initSession();
  }

  async ensureCsrf(): Promise<string> {
    await this.request("/auth/csrf/", { method: "GET", credentials: true });
    return "";
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = (options.method || "GET").toUpperCase() as HttpMethod;
    const useCredentials = options.credentials !== false;
    if (options.formData) {
      throw new Error("FormData uploads via Electron IPC are not supported in this foundation.");
    }

    const result = await this.bridge.http({
      path,
      method,
      json: options.json,
      credentials: useCredentials,
      timeoutMs: options.timeoutMs,
    });

    if (!result.ok) {
      const error = new ApiError({
        status: result.status,
        data: (result.data ?? {}) as import("./errors.js").ApiErrorBody,
        path: result.path,
        method: result.method,
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

    if (result.status === 204) return undefined as T;
    return result.data as T;
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
