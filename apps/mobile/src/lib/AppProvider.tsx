import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetch as expoFetch } from "expo/fetch";
import { ApiClient } from "@checkstation/api";
import { AuthController, type AuthState } from "@checkstation/auth";
import { createTranslator, resolveLocale, type AppLocale } from "@checkstation/i18n";
import { warmAppleIapSession } from "../billing/appleIap";
import { loadMobileConfig } from "./config";
import { clearAllKioskMediaCache, clearKioskMediaCacheForWorkspace } from "./kioskMediaCache";
import { clearAllKioskExitTokens } from "./kioskExitCredential";
import { createSecureCookieJar } from "./secureCookieJar";
import { useAppForegroundRefresh } from "./useAppForegroundRefresh";

type AppContextValue = {
  api: ApiClient;
  auth: AuthController;
  authState: AuthState;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
  revision: number;
  /** Refresh session/workspace and bump revision so Plan/local lists refetch. */
  refreshWorkspace: () => Promise<void>;
  /** Refresh session/workspace entitlements without bumping revision (avoids Plan loops). */
  syncWorkspace: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(resolveLocale());
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [authState, setAuthState] = useState<AuthState>({
    status: "unknown",
    session: null,
    twoFactorPending: false,
    bootstrapError: null,
  });

  const { api, auth } = useMemo(() => {
    const config = loadMobileConfig();
    // expo/fetch exposes Set-Cookie more reliably than RN's default whatwg-fetch.
    const client = new ApiClient(config, createSecureCookieJar(), {
      fetchImpl: expoFetch as typeof fetch,
    });
    const controller = new AuthController(client);
    return { api: client, auth: controller };
  }, []);

  useEffect(() => {
    const unsub = auth.subscribe(setAuthState);
    void auth.bootstrap().finally(() => setReady(true));
    return unsub;
  }, [auth]);

  const previousWorkspaceId = useRef<number | string | null>(null);
  useEffect(() => {
    const nextId = authState.session?.workspace?.id ?? null;
    if (authState.status === "anonymous") {
      void clearAllKioskMediaCache();
      void clearAllKioskExitTokens();
      previousWorkspaceId.current = null;
      return;
    }
    if (
      previousWorkspaceId.current != null
      && nextId != null
      && String(previousWorkspaceId.current) !== String(nextId)
    ) {
      void clearKioskMediaCacheForWorkspace(String(previousWorkspaceId.current));
      void clearAllKioskExitTokens();
    }
    if (nextId != null) previousWorkspaceId.current = nextId;
  }, [authState.session?.workspace?.id, authState.status]);

  useEffect(() => {
    // One process-lifetime Apple IAP session shared by Plan fetch/restore/purchase.
    warmAppleIapSession();
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);
  const syncWorkspace = useMemo(() => async () => {
    await auth.refreshWorkspace();
  }, [auth]);
  const refreshWorkspace = useMemo(() => async () => {
    await auth.refreshWorkspace();
    setRevision((current) => current + 1);
  }, [auth]);

  const authStatusRef = useRef(authState.status);
  authStatusRef.current = authState.status;
  // App resume: refresh authoritative workspace/session so plan entitlements stay current.
  // Plan listens to `revision` and also refetches OwnerBillingView on its own focus/foreground.
  useAppForegroundRefresh(() => {
    if (authStatusRef.current !== "authenticated") return;
    void refreshWorkspace();
  }, { enabled: ready });

  const value: AppContextValue = {
    api,
    auth,
    authState,
    locale,
    setLocale,
    t,
    ready,
    revision,
    refreshWorkspace,
    syncWorkspace,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp requires AppProvider");
  return ctx;
}
