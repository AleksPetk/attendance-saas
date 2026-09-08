import { useMemo, useEffect, useState, createContext, useContext } from "react";
import { ApiClient, CookieJar, TransportApiClient } from "@checkstation/api";
import { AuthController, type AuthState } from "@checkstation/auth";
import { createAppConfig } from "@checkstation/config";
import { createTranslator, resolveLocale, type AppLocale } from "@checkstation/i18n";

type DesktopBridge = {
  platform: string;
  initSession: () => Promise<void>;
  clearSession: () => Promise<void>;
  http: (req: {
    path: string;
    method?: string;
    json?: unknown;
    credentials?: boolean;
    timeoutMs?: number;
    responseType?: "base64";
    formData?: Array<
      | { name: string; kind: "text"; value: string }
      | { name: string; kind: "file"; value: string; filename: string; type: string }
    >;
  }) => Promise<
    | { ok: true; status: number; data: unknown }
    | { ok: false; status: number; data: unknown; path: string; method: string }
  >;
  saveFile?: (req: { defaultPath: string; base64: string }) => Promise<{ saved: boolean; path?: string }>;
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
    void auth.bootstrap().finally(() => setReady(true));
    return unsub;
  }, [auth]);

  const t = useMemo(() => createTranslator(locale), [locale]);
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

export async function loadDesktopApiAsset(path: string): Promise<string> {
  const bridge = window.checkstationDesktop;
  if (!bridge) return path;
  const result = await bridge.http({ path, method: "GET", credentials: true, responseType: "base64" });
  if (!result.ok) throw new Error(`Image request failed (${result.status})`);
  const data = result.data as { base64?: string; contentType?: string };
  if (!data.base64) throw new Error("The image was empty.");
  const raw = atob(data.base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: data.contentType || "application/octet-stream" }));
}
