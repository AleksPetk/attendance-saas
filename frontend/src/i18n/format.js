import { normalizeLocale } from "./language.js";

function intlLocale(locale) {
  const normalized = normalizeLocale(locale);
  return normalized === "ja" ? "ja-JP" : "en-US";
}

export function formatDate(value, locale, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  }).format(date);
}

export function formatDateTime(value, locale, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);
}

export function formatNumber(value, locale, options = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat(intlLocale(locale), options).format(amount);
}

/**
 * Format money using explicit currency — never infer currency from locale.
 */
export function formatCurrency(amount, { locale, currency, ...options } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  const code = String(currency || "USD").toUpperCase();
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: code,
    ...options,
  }).format(value);
}
