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
  }) => Promise<
    | { ok: true; status: number; data: unknown }
    | { ok: false; status: number; data: unknown; path: string; method: string }
  >;
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
  t: (key: string) => string;
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
