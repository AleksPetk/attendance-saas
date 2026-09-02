/** Canonical UI locale keys — not billing market or currency. */

export const SUPPORTED_LOCALES = ["en", "ja"];

export const DEFAULT_LOCALE = "en";

export const LOCALE_STORAGE_KEY = "checkstation.locale";

export const LOCALE_EXPLICIT_KEY = "checkstation.locale.explicit";

export const LOCALE_LABELS = {
  en: "English",
  ja: "日本語",
};

/**
 * Normalize browser or stored language tags to supported app locales.
 * Unknown values fall back to English.
 */
export function normalizeLocale(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!raw) return DEFAULT_LOCALE;
  const primary = raw.split("-", 1)[0];
  if (SUPPORTED_LOCALES.includes(primary)) return primary;
  return DEFAULT_LOCALE;
}

export function isSupportedLocale(value) {
  return SUPPORTED_LOCALES.includes(normalizeLocale(value));
}

export function browserLocale() {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const candidates = [
    ...(navigator.languages || []),
    navigator.language,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (SUPPORTED_LOCALES.includes(normalized)) {
      return normalized;
    }
  }
  return DEFAULT_LOCALE;
}

export function localeHtmlLang(locale) {
  const normalized = normalizeLocale(locale);
  return normalized === "ja" ? "ja" : "en";
}
