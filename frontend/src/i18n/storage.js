import {
  DEFAULT_LOCALE,
  LOCALE_EXPLICIT_KEY,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
} from "./language.js";

function readStorage(key) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function readSavedLocale() {
  return normalizeLocale(readStorage(LOCALE_STORAGE_KEY));
}

export function hasExplicitSavedLocale() {
  return readStorage(LOCALE_EXPLICIT_KEY) === "1";
}

export function saveLocalePreference(locale, { explicit = false } = {}) {
  const normalized = normalizeLocale(locale);
  writeStorage(LOCALE_STORAGE_KEY, normalized);
  writeStorage(LOCALE_EXPLICIT_KEY, explicit ? "1" : "");
  return normalized;
}

/**
 * First-visit resolution (sync):
 * 1. explicit saved frontend preference
 * 2. English fallback (trusted geo applied asynchronously; never browser language)
 */
export function resolveInitialLocale() {
  if (hasExplicitSavedLocale()) {
    return readSavedLocale();
  }
  return DEFAULT_LOCALE;
}

export function clearExplicitLocaleFlag() {
  writeStorage(LOCALE_EXPLICIT_KEY, "");
}

export { DEFAULT_LOCALE };
