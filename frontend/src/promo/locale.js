/** Promo-site locale — independent from Workspace, Docs, and Status. */

export const PROMO_LOCALE_STORAGE_KEY = "checkstation.promo.locale";
export const SUPPORTED_PROMO_LOCALES = ["en", "ja"];
export const DEFAULT_PROMO_LOCALE = "en";

const PROMO_PAGE_SLUGS = new Set([
  "",
  "features",
  "how-it-works",
  "pricing",
  "contact",
]);

export function normalizePromoLocale(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
  const primary = raw.split("-", 1)[0];
  return SUPPORTED_PROMO_LOCALES.includes(primary) ? primary : DEFAULT_PROMO_LOCALE;
}

export function resolvePromoLocaleFromPath(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  const match = normalized.match(/^\/(en|ja)(?:\/|$)/);
  return match ? match[1] : null;
}

/** Strip /en or /ja prefix; return logical path like /, /features, /pricing */
export function promoLogicalPath(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  const withoutLocale = normalized.replace(/^\/(en|ja)(?=\/|$)/, "") || "/";
  if (withoutLocale === "/" || withoutLocale === "") return "/";
  return withoutLocale.startsWith("/") ? withoutLocale : `/${withoutLocale}`;
}

export function promoPathFor(logicalPath, locale) {
  const lang = normalizePromoLocale(locale);
  const logical = promoLogicalPath(logicalPath);
  if (logical === "/") return `/${lang}/`;
  return `/${lang}${logical}`;
}

export function isPromoMarketingPath(pathname) {
  const logical = promoLogicalPath(pathname);
  if (logical === "/") return true;
  const slug = logical.replace(/^\//, "").split("/")[0];
  return PROMO_PAGE_SLUGS.has(slug);
}

export function savePromoLocalePreference(locale) {
  const normalized = normalizePromoLocale(locale);
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(PROMO_LOCALE_STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
}

export function readPromoLocalePreference() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const value = window.localStorage.getItem(PROMO_LOCALE_STORAGE_KEY);
    return SUPPORTED_PROMO_LOCALES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

function browserPromoLocale() {
  const raw = String(
    (typeof navigator !== "undefined" && navigator.language) || "",
  ).toLowerCase();
  if (raw.startsWith("ja")) return "ja";
  return DEFAULT_PROMO_LOCALE;
}

export function resolveInitialPromoLocale(pathname) {
  return (
    resolvePromoLocaleFromPath(pathname) ||
    readPromoLocalePreference() ||
    browserPromoLocale() ||
    DEFAULT_PROMO_LOCALE
  );
}

export function fillPromoTemplate(template, values = {}) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) =>
    values[key] == null ? "" : String(values[key]),
  );
}

/** True when JA should show a same-slot placeholder instead of an EN product shot. */
export function shouldUsePromoImagePlaceholder(locale, jaSrc) {
  return locale === "ja" && !jaSrc;
}
