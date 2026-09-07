import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ApiClient } from "@checkstation/api";
import { AuthController, type AuthState } from "@checkstation/auth";
import { createTranslator, resolveLocale, type AppLocale } from "@checkstation/i18n";
import { loadMobileConfig } from "./config";
import { createSecureCookieJar } from "./secureCookieJar";

type AppContextValue = {
  api: ApiClient;
  auth: AuthController;
  authState: AuthState;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(resolveLocale());
  const [ready, setReady] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({
    status: "unknown",
    session: null,
    twoFactorPending: false,
    bootstrapError: null,
  });

  const { api, auth } = useMemo(() => {
    const config = loadMobileConfig();
    const client = new ApiClient(config, createSecureCookieJar());
    const controller = new AuthController(client);
    return { api: client, auth: controller };
  }, []);

  useEffect(() => {
    const unsub = auth.subscribe(setAuthState);
    void auth.bootstrap().finally(() => setReady(true));
    return unsub;
  }, [auth]);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const value: AppContextValue = {
    api,
    auth,
    authState,
    locale,
    setLocale,
    t,
    ready,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp requires AppProvider");
  return ctx;
}
