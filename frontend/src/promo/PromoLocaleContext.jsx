import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import i18n from "../i18n/index.js";
import { normalizeLocale } from "../i18n/language.js";
import { saveLocalePreference } from "../i18n/storage.js";
import {
  normalizePromoLocale,
  promoLogicalPath,
  promoPathFor,
  resolvePromoLocaleFromPath,
  savePromoLocalePreference,
} from "./locale.js";
import { promoCatalog, promoTranslate } from "./t.js";
import { resolveAuthHandoffUrl, resolvePromoHandoffUrl } from "../siteOrigins.js";

const PromoLocaleContext = createContext(null);

export function PromoLocaleProvider({ children, locale: localeProp }) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromPath = resolvePromoLocaleFromPath(location.pathname);
  // Prefer the URL locale so sibling /en ↔ /ja navigations never keep a stale prop.
  const locale = normalizePromoLocale(
    fromPath || localeProp || params.locale || "en",
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "ja" ? "ja" : "en";
    }
    savePromoLocalePreference(locale);
  }, [locale]);

  const t = useCallback(
    (key, values) => promoTranslate(locale, key, values),
    [locale],
  );

  const setPromoLocale = useCallback(
    (nextLocale) => {
      const normalized = normalizePromoLocale(nextLocale);
      savePromoLocalePreference(normalized);
      const logical = promoLogicalPath(location.pathname);
      const nextPath = promoPathFor(logical, normalized);
      const search = location.search || "";
      const hash = location.hash || "";
      const relative = `${nextPath}${search}${hash}`;
      const target = resolvePromoHandoffUrl(
        relative,
        typeof window !== "undefined" ? window.location.origin : "",
      );
      if (/^https?:\/\//i.test(target)) {
        window.location.assign(target);
        return normalized;
      }
      navigate(relative);
      return normalized;
    },
    [location.hash, location.pathname, location.search, navigate],
  );

  /**
   * Bridge promo locale into main app i18n when entering auth from promo.
   * Hard-navigate to the workspace origin when configured so credentialed
   * login is same-origin (promo must not use credentialed workspace CORS).
   */
  const handoffToAuth = useCallback(
    (authPath) => {
      const normalized = normalizeLocale(locale);
      savePromoLocalePreference(normalized);
      saveLocalePreference(normalized, { explicit: true });
      void i18n.changeLanguage(normalized);
      if (typeof document !== "undefined") {
        document.documentElement.lang = normalized === "ja" ? "ja" : "en";
      }
      const target = resolveAuthHandoffUrl(
        authPath,
        typeof window !== "undefined" ? window.location.origin : "",
      );
      if (/^https?:\/\//i.test(target)) {
        window.location.assign(target);
        return;
      }
      navigate(authPath);
    },
    [locale, navigate],
  );

  const value = useMemo(
    () => ({
      locale,
      t,
      catalog: promoCatalog(locale),
      setPromoLocale,
      handoffToAuth,
      pathFor: (logical) => promoPathFor(logical, locale),
    }),
    [handoffToAuth, locale, setPromoLocale, t],
  );

  return (
    <PromoLocaleContext.Provider value={value}>{children}</PromoLocaleContext.Provider>
  );
}

export function usePromoLocale() {
  const ctx = useContext(PromoLocaleContext);
  if (!ctx) {
    throw new Error("usePromoLocale must be used within PromoLocaleProvider");
  }
  return ctx;
}

/** Returns null outside PromoLocaleProvider (e.g. ProductImageSlot on non-promo pages). */
export function useOptionalPromoLocale() {
  return useContext(PromoLocaleContext);
}
