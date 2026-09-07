import { useMemo, useEffect, useState, createContext, useContext } from "react";
import { ApiClient, CookieJar, MemoryCookieStorage } from "@checkstation/api";
import { AuthController, type AuthState } from "@checkstation/auth";
import { createAppConfig } from "@checkstation/config";
import { createTranslator, resolveLocale, type AppLocale } from "@checkstation/i18n";

type Ctx = {
  api: ApiClient;
  auth: AuthController;
  authState: AuthState;
  locale: AppLocale;
  setLocale: (l: AppLocale) => void;
  t: (key: string) => string;
  ready: boolean;
};

const AppContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "checkstation.desktop.cookies.v1";

class LocalStorageCookieStorage extends MemoryCookieStorage {
  async load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  async save(cookies: any[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cookies));
  }
  async clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
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
    const config = createAppConfig({
      environment: import.meta.env.PROD ? "production" : "development",
      apiBaseUrl:
        import.meta.env.VITE_API_BASE_URL
        || (import.meta.env.PROD
          ? "https://workspace.checkstation.app/api"
          : "http://localhost:8000/api"),
    });
    const client = new ApiClient(config, new CookieJar(new LocalStorageCookieStorage()));
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
