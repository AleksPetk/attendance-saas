import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { isPromoMarketingPath } from "../promo/locale.js";
import i18n from "./index.js";
import { localeHtmlLang, LOCALE_LABELS, normalizeLocale, SUPPORTED_LOCALES } from "./language.js";
import { saveLocalePreference } from "./storage.js";

const LanguageContext = createContext(null);

function applyDocumentLanguage(locale) {
  if (typeof document === "undefined") return;
  // Promo marketing pages own html lang via applyPromoSeo / PromoLocaleProvider.
  if (typeof window !== "undefined" && isPromoMarketingPath(window.location.pathname)) {
    return;
  }
  document.documentElement.lang = localeHtmlLang(locale);
}

function ownerPreferredLanguage(session) {
  if (session?.workspace?.account_kind !== "owner") return null;
  const value = session?.workspace?.preferred_language;
  return value ? normalizeLocale(value) : null;
}

export function LanguageProvider({ children, session = null, updatePreferredLanguage }) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(i18n.language));
  const ownerLanguage = ownerPreferredLanguage(session);
  const lastOwnerLanguage = useRef(null);

  const setLanguage = useCallback(
    async (nextLocale, { explicit = true, persistBackend = true } = {}) => {
      const normalized = normalizeLocale(nextLocale);
      if (normalized === normalizeLocale(i18n.language)) {
        saveLocalePreference(normalized, { explicit });
        applyDocumentLanguage(normalized);
        setLocaleState(normalized);
      } else {
        await i18n.changeLanguage(normalized);
        saveLocalePreference(normalized, { explicit });
        applyDocumentLanguage(normalized);
        setLocaleState(normalized);
      }

      const shouldPersistBackend =
        persistBackend &&
        typeof updatePreferredLanguage === "function" &&
        session?.workspace?.account_kind === "owner";

      if (shouldPersistBackend) {
        try {
          await updatePreferredLanguage(normalized);
        } catch {
          /* UI language still switches locally; backend sync can retry later */
        }
      }

      return normalized;
    },
    [session, updatePreferredLanguage],
  );

  useEffect(() => {
    const handleLanguageChanged = (next) => {
      const normalized = normalizeLocale(next);
      setLocaleState(normalized);
      applyDocumentLanguage(normalized);
    };
    i18n.on("languageChanged", handleLanguageChanged);
    applyDocumentLanguage(i18n.language);
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, []);

  useEffect(() => {
    if (!ownerLanguage) return;
    if (lastOwnerLanguage.current === ownerLanguage) return;
    lastOwnerLanguage.current = ownerLanguage;
    void setLanguage(ownerLanguage, { explicit: true, persistBackend: false });
  }, [ownerLanguage, setLanguage]);

  const value = useMemo(
    () => ({
      locale,
      supportedLocales: SUPPORTED_LOCALES,
      localeLabels: LOCALE_LABELS,
      setLanguage,
      normalizeLocale,
    }),
    [locale, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
