import { useMemo, useEffect, useState, useRef, createContext, useContext } from "react";
import { ApiClient, CookieJar, TransportApiClient } from "@checkstation/api";
import { AuthController, type AuthState } from "@checkstation/auth";
import { createAppConfig } from "@checkstation/config";
import { createTranslator, resolveLocale, type AppLocale } from "@checkstation/i18n";
import { desktopRefresh, installForegroundRefresh } from "./foregroundRefresh";
import { useForegroundRefresh } from "./useForegroundRefresh";
import { clearAllKioskExitTokens, clearKioskExitTokensForWorkspace, hydrateKioskExitCredentialsFromDisk, armKioskLockFromRestoredCredentials } from "./kioskExitCredential";
import { clearDesktopKioskActive, getDesktopKioskActiveGroupId } from "./kioskSessionLock";

type DesktopBridge = {
  platform: string;
  startupReady?: () => void;
  initSession: () => Promise<void>;
  clearSession: () => Promise<void>;
  clearMediaCache?: (request?: { workspaceKey?: string | null }) => Promise<{ ok: boolean }>;
  kioskExitCredentialSave?: (request: {
    workspaceKey: string;
    groupId: string;
    token: string;
    ttlMs?: number;
  }) => Promise<{ ok: boolean; reason?: string }>;
  kioskExitCredentialLoad?: (request: {
    workspaceKey: string;
    groupId: string;
  }) => Promise<{
    token: string;
    groupId: string;
    workspaceKey: string;
    savedAt: number;
    expiresAt: number;
  } | null>;
  kioskExitCredentialClear?: (request?: {
    workspaceKey?: string;
    groupId?: string;
  }) => Promise<{ ok: boolean }>;
  kioskExitCredentialList?: () => Promise<Array<{
    token: string;
    groupId: string;
    workspaceKey: string;
    savedAt: number;
    expiresAt: number;
  }>>;
  http: (req: {
    path: string;
    method?: string;
    json?: unknown;
    credentials?: boolean;
    timeoutMs?: number;
    responseType?: "base64";
    cacheNamespace?: string;
    formData?: Array<
      | { name: string; kind: "text"; value: string }
      | { name: string; kind: "file"; value: string; filename: string; type: string }
    >;
  }) => Promise<
    | { ok: true; status: number; data: unknown; fromCache?: boolean; cacheHit?: string | null }
    | { ok: false; status: number; data: unknown; path: string; method: string; fromCache?: boolean; cacheHit?: string | null }
  >;
  saveFile?: (req: { defaultPath: string; base64: string }) => Promise<{ saved: boolean; path?: string }>;
  getProductTourPrefs?: () => Promise<{ version?: number; seen?: boolean; locale?: "en" | "ja" }>;
  setProductTourPrefs?: (prefs: {
    seen?: boolean;
    locale?: "en" | "ja";
  }) => Promise<{ version?: number; seen?: boolean; locale?: "en" | "ja" }>;
  isGoogleOAuthConfigured?: () => Promise<boolean>;
  getDesktopDistribution?: () => Promise<{
    distribution: "direct" | "mas";
    bundleId: string;
    releaseOutputDir: string;
    billingMode: "stripe_web" | "apple_iap";
    appleAuthMode: "web_compatible" | "native";
    googleAuthEnabled: boolean;
  }>;
  requestGoogleIdentityToken?: () => Promise<
    | { kind: "success"; identityToken: string }
    | { kind: "cancelled" }
    | { kind: "unavailable" }
    | { kind: "misconfigured" }
    | { kind: "missing_token" }
    | { kind: "error"; message?: string }
  >;
  requestGoogleWebOAuth?: (request?: {
    intent?: "login" | "register";
    legalAcknowledgement?: boolean;
  }) => Promise<
    | { kind: "success"; resultCode: string; handoff: string }
    | { kind: "failed"; resultCode: string }
    | { kind: "unavailable" }
    | { kind: "error"; message?: string }
  >;
  requestAppleWebOAuth?: (request?: {
    intent?: "login" | "register";
    legalAcknowledgement?: boolean;
  }) => Promise<
    | { kind: "success"; resultCode: string; handoff: string }
    | { kind: "failed"; resultCode: string }
    | { kind: "unavailable" }
    | { kind: "error"; message?: string }
  >;
  requestAppleNativeSignIn?: () => Promise<
    | { kind: "success"; identityToken: string; nonce: string; fullName?: { givenName?: string; familyName?: string } | null }
    | { kind: "cancelled" }
    | { kind: "unavailable" }
    | { kind: "signing_required" }
    | { kind: "missing_token" }
    | { kind: "error"; message?: string }
  >;
  loadStoreKitProducts?: () => Promise<
    | { kind: "success"; products: Array<{ productId: string; displayPrice: string; title?: string; description?: string }> }
    | { kind: "signing_required"; products: [] }
    | { kind: "unavailable"; products: [] }
    | { kind: "error"; message?: string; products: [] }
  >;
  purchaseStoreKitSubscription?: (request: {
    productId: string;
    appAccountToken: string;
  }) => Promise<
    | { kind: "success"; productId: string; signedTransaction: string }
    | { kind: "cancelled" }
    | { kind: "pending" }
    | { kind: "signing_required" }
    | { kind: "unavailable" }
    | { kind: "error"; message?: string }
  >;
  restoreStoreKitPurchases?: () => Promise<
    | { kind: "success"; transactions: Array<{ productId: string; signedTransaction: string }> }
    | { kind: "signing_required"; transactions: [] }
    | { kind: "unavailable"; transactions: [] }
    | { kind: "error"; message?: string; transactions: [] }
  >;
  openAppleManageSubscriptions?: () => Promise<
    | { kind: "success" }
    | { kind: "signing_required" }
    | { kind: "unavailable" }
    | { kind: "error"; message?: string }
  >;
  prepareBillingReturn?: () => Promise<
    | { kind: "ready"; id: string; desktopReturnUrl: string }
    | { kind: "unavailable" }
  >;
  openBillingReturn?: (request: {
    id: string;
    url: string;
    title?: string;
    body?: string;
  }) => Promise<
    | { kind: "returned"; checkout?: string; portal?: string }
    | { kind: "timeout" }
    | { kind: "unavailable" }
    | { kind: "error"; message?: string }
  >;
  cancelBillingReturn?: (request: { id: string }) => Promise<{ ok: boolean }>;
};

declare global {
  interface Window {
    checkstationDesktop?: DesktopBridge;
  }
}

type AuthApi = ApiClient | TransportApiClient;

type Ctx = {
  api: AuthApi;
  auth: AuthController;
  authState: AuthState;
  locale: AppLocale;
  setLocale: (l: AppLocale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
};

const AppContext = createContext<Ctx | null>(null);

function buildConfig() {
  return createAppConfig({
    environment: import.meta.env.PROD ? "production" : "development",
    apiBaseUrl:
      import.meta.env.VITE_API_BASE_URL
      || (import.meta.env.PROD
        ? "https://workspace.checkstation.app/api"
        : "http://localhost:8000/api"),
  });
}

function createDesktopApi(): AuthApi {
  const config = buildConfig();
  const bridge = typeof window !== "undefined" ? window.checkstationDesktop : undefined;
  if (
    bridge
    && typeof bridge.http === "function"
    && typeof bridge.initSession === "function"
    && typeof bridge.clearSession === "function"
  ) {
    // Session cookies live in Electron main (encrypted userData), not renderer storage.
    return new TransportApiClient(config, bridge);
  }
  // Vite-only browser preview: in-memory jar (never persist session secrets to localStorage).
  return new ApiClient(config, new CookieJar());
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(resolveLocale(navigator.language));
  const [ready, setReady] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({
    status: "unknown",
    session: null,
    twoFactorPending: false,
    bootstrapError: null,
  });

  const { api, auth } = useMemo(() => {
    const client = createDesktopApi();
    return { api: client, auth: new AuthController(client) };
  }, []);

  useEffect(() => {
    const unsub = auth.subscribe(setAuthState);
    void (async () => {
      await hydrateKioskExitCredentialsFromDisk();
      await auth.bootstrap();
      armKioskLockFromRestoredCredentials(auth.getState().status);
      setReady(true);
    })();
    return unsub;
  }, [auth]);

  const previousWorkspaceId = useRef<number | string | null>(null);
  const previousStatus = useRef<AuthState["status"]>("unknown");
  useEffect(() => {
    const nextId = authState.session?.workspace?.id ?? null;
    const prevStatus = previousStatus.current;
    previousStatus.current = authState.status;

    if (authState.status === "anonymous") {
      // Session expiry while kiosk is active must keep the exit token + media cache.
      if (getDesktopKioskActiveGroupId()) {
        return;
      }
      if (prevStatus === "authenticated" || prevStatus === "kiosk_locked") {
        clearAllKioskExitTokens();
        clearDesktopKioskActive();
        void window.checkstationDesktop?.clearMediaCache?.();
      }
      previousWorkspaceId.current = null;
      return;
    }

    if (
      previousWorkspaceId.current != null
      && nextId != null
      && String(previousWorkspaceId.current) !== String(nextId)
    ) {
      clearKioskExitTokensForWorkspace(previousWorkspaceId.current);
      clearDesktopKioskActive();
      void window.checkstationDesktop?.clearMediaCache?.({
        workspaceKey: String(previousWorkspaceId.current),
      });
    }
    if (nextId != null) previousWorkspaceId.current = nextId;
  }, [authState.session?.workspace?.id, authState.status]);

  const t = useMemo(() => createTranslator(locale), [locale]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useForegroundRefresh(async () => {
    if (authState.status === "authenticated") await auth.refreshWorkspace();
  });
  useEffect(() => installForegroundRefresh(window, document, () => desktopRefresh.refresh()), []);
  return (
    <AppContext.Provider value={{ api, auth, authState, locale, setLocale, t, ready }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp requires AppProvider");
  return ctx;
}

export async function downloadDesktopApiFile(path: string, defaultName: string) {
  const bridge = window.checkstationDesktop;
  if (!bridge?.saveFile) throw new Error("Desktop file saving is unavailable.");
  const result = await bridge.http({ path, method: "GET", credentials: true, timeoutMs: 60_000, responseType: "base64" });
  if (!result.ok) {
    const body = result.data as { detail?: string } | null;
    throw new Error(body?.detail || `Export failed (${result.status})`);
  }
  const data = result.data as { base64?: string; contentDisposition?: string };
  const quoted = data.contentDisposition?.match(/filename="([^"]+)"/i)?.[1];
  const encoded = data.contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : quoted || defaultName;
  if (!data.base64) throw new Error("The report file was empty.");
  return bridge.saveFile({ defaultPath: name, base64: data.base64 });
}

export async function loadDesktopApiAsset(path: string, cacheNamespace?: string): Promise<string> {
  const bridge = window.checkstationDesktop;
  if (!bridge) return path;
  const result = await bridge.http({
    path,
    method: "GET",
    credentials: true,
    responseType: "base64",
    cacheNamespace: cacheNamespace || undefined,
  });
  if (!result.ok) throw new Error(`Image request failed (${result.status})`);
  const data = result.data as { base64?: string; contentType?: string };
  if (!data.base64) throw new Error("The image was empty.");
  const raw = atob(data.base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: data.contentType || "application/octet-stream" }));
}
