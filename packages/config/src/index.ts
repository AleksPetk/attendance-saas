/**
 * Environment configuration for CheckStation native clients.
 * Never hardcode secrets. Production API is the workspace origin /api.
 */

export type AppEnvironment = "development" | "staging" | "production";

export type CheckStationAppConfig = {
  environment: AppEnvironment;
  /** Absolute origin including /api prefix, e.g. https://workspace.checkstation.app/api */
  apiBaseUrl: string;
  /** Public docs site (Help links). */
  docsBaseUrl: string;
  /** Public status site. */
  statusBaseUrl: string;
  /** Marketing site (account deletion / plans info links). */
  promoBaseUrl: string;
  /** Request timeout in ms. */
  requestTimeoutMs: number;
  /** App display name. */
  appDisplayName: string;
  /** Bundle / application id placeholders until store IDs are finalized. */
  iosBundleId: string;
  androidPackage: string;
  macosBundleId: string;
  windowsAppId: string;
};

const DEFAULTS: CheckStationAppConfig = {
  environment: "development",
  apiBaseUrl: "http://localhost:8000/api",
  docsBaseUrl: "https://docs.checkstation.app",
  statusBaseUrl: "https://status.checkstation.app",
  promoBaseUrl: "https://checkstation.app",
  requestTimeoutMs: 30_000,
  appDisplayName: "CheckStation",
  iosBundleId: "app.checkstation.mobile",
  androidPackage: "app.checkstation.mobile",
  macosBundleId: "app.checkstation.desktop",
  windowsAppId: "app.checkstation.desktop",
};

export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = String(raw || "").trim().replace(/\/$/, "");
  if (!trimmed) {
    throw new Error("apiBaseUrl is required for native clients (absolute URL ending in /api).");
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(trimmed) === false) {
    if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
      throw new Error(`apiBaseUrl must be an absolute http(s) URL, got: ${trimmed}`);
    }
  }
  // Accept either .../api or origin; normalize to .../api
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}

export function createAppConfig(
  overrides: Partial<CheckStationAppConfig> = {},
): CheckStationAppConfig {
  const merged: CheckStationAppConfig = {
    ...DEFAULTS,
    ...overrides,
    apiBaseUrl: normalizeApiBaseUrl(
      overrides.apiBaseUrl ?? DEFAULTS.apiBaseUrl,
    ),
  };
  if (merged.environment === "production") {
    if (/localhost|127\.0\.0\.1/i.test(merged.apiBaseUrl)) {
      throw new Error(
        "Production config refused localhost API base. Use https://workspace.checkstation.app/api",
      );
    }
    if (!merged.apiBaseUrl.startsWith("https://")) {
      throw new Error("Production apiBaseUrl must use https.");
    }
  }
  return merged;
}

export const PRODUCTION_APP_CONFIG = createAppConfig({
  environment: "production",
  apiBaseUrl: "https://workspace.checkstation.app/api",
});

export const DEVELOPMENT_APP_CONFIG = createAppConfig({
  environment: "development",
  apiBaseUrl: "http://localhost:8000/api",
  docsBaseUrl: "http://localhost:8091",
  statusBaseUrl: "http://localhost:8092",
  promoBaseUrl: "http://localhost:5173",
});
