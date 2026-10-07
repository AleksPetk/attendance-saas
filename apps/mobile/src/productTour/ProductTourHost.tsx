import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { router } from "expo-router";
import type { AppLocale } from "@checkstation/i18n";
import { useApp } from "../lib/AppProvider";
import { MobileProductTour, type ProductTourMode } from "./MobileProductTour";
import { loadProductTourPrefs, saveProductTourPrefs, type ProductTourPrefs } from "./productTourStorage";

type ProductTourContextValue = {
  prefsReady: boolean;
  prefs: ProductTourPrefs;
  open: boolean;
  mode: ProductTourMode | null;
  openReplay: (mode?: Extract<ProductTourMode, "replay-auth" | "replay-help">) => void;
};

const ProductTourContext = createContext<ProductTourContextValue | null>(null);

export function ProductTourProvider({ children }: { children: ReactNode }) {
  const { ready, authState, locale, setLocale } = useApp();
  const [prefs, setPrefs] = useState<ProductTourPrefs>({ version: 1, seen: false });
  const [prefsReady, setPrefsReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ProductTourMode | null>(null);
  const [localeSynced, setLocaleSynced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadProductTourPrefs().then((loaded) => {
      if (cancelled) return;
      setPrefs(loaded);
      setPrefsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefsReady || localeSynced) return;
    if (prefs.locale) setLocale(prefs.locale);
    setLocaleSynced(true);
  }, [prefsReady, prefs.locale, localeSynced, setLocale]);

  // Do not wait on localeSynced — first-launch must open as soon as auth is ready.
  useEffect(() => {
    if (!ready || !prefsReady) return;
    if (open) return;
    if (authState.status !== "anonymous") return;
    if (prefs.seen) return;
    setMode("first-launch");
    setOpen(true);
  }, [ready, prefsReady, open, authState.status, prefs.seen]);

  useEffect(() => {
    if (authState.status === "authenticated" || authState.status === "kiosk_locked") {
      if (mode === "first-launch") {
        setOpen(false);
        setMode(null);
      }
    }
  }, [authState.status, mode]);

  const persist = useCallback(async (patch: Partial<ProductTourPrefs>) => {
    const next = await saveProductTourPrefs(patch);
    setPrefs(next);
    return next;
  }, []);

  const markSeen = useCallback(async () => {
    await persist({ seen: true, locale });
  }, [persist, locale]);

  const openReplay = useCallback(
    (nextMode: Extract<ProductTourMode, "replay-auth" | "replay-help"> = "replay-auth") => {
      setMode(nextMode);
      setOpen(true);
    },
    [],
  );

  const closeTour = useCallback(() => {
    setOpen(false);
    setMode(null);
  }, []);

  const handleSkip = useCallback(async () => {
    if (mode === "first-launch") await markSeen();
    closeTour();
  }, [mode, markSeen, closeTour]);

  const handleClose = useCallback(() => {
    closeTour();
  }, [closeTour]);

  const handleCreateAccount = useCallback(async () => {
    await markSeen();
    closeTour();
    if (mode === "replay-help") return;
    router.replace("/(auth)/register");
  }, [markSeen, closeTour, mode]);

  const handleSignIn = useCallback(async () => {
    await markSeen();
    closeTour();
    if (mode === "replay-help") return;
    router.replace("/(auth)/sign-in");
  }, [markSeen, closeTour, mode]);

  const handleLocaleChange = useCallback(
    async (next: AppLocale) => {
      setLocale(next);
      await persist({ locale: next });
    },
    [setLocale, persist],
  );

  const value = useMemo<ProductTourContextValue>(
    () => ({ prefsReady, prefs, open, mode, openReplay }),
    [prefsReady, prefs, open, mode, openReplay],
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      {open && mode ? (
        <MobileProductTour
          locale={locale}
          mode={mode}
          onLocaleChange={(next) => void handleLocaleChange(next)}
          onSkip={() => void handleSkip()}
          onClose={handleClose}
          onCreateAccount={() => void handleCreateAccount()}
          onSignIn={() => void handleSignIn()}
        />
      ) : null}
    </ProductTourContext.Provider>
  );
}

export function useProductTour() {
  const ctx = useContext(ProductTourContext);
  if (!ctx) throw new Error("useProductTour requires ProductTourProvider");
  return ctx;
}

export function ProductTourHost({ children }: { children: ReactNode }) {
  return <ProductTourProvider>{children}</ProductTourProvider>;
}
