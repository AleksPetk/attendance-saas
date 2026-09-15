import type { AppLocale } from "@checkstation/i18n";
import { suggestedSubject } from "@checkstation/domain";
import labels from "./contactCatalog.labels.json";

/** Resolve Contact category/subcategory labels by canonical ID (promo catalog parity). */
export function contactCatalogLabel(
  locale: AppLocale | string,
  id: string,
  fallback = "",
): string {
  const map = (locale === "ja" ? labels.ja : labels.en) || {};
  const key = String(id || "").trim();
  if (!key) return fallback || "";
  return map[key as keyof typeof map] || fallback || key;
}

/** Subject uses the same catalog labels as browser Workspace / Desktop Contact. */
export function mobileContactSubject(
  locale: string,
  categoryId: string,
  categoryLabel: string,
  subcategoryId: string,
  subcategoryLabel: string,
): string {
  return suggestedSubject(
    contactCatalogLabel(locale, categoryId, categoryLabel),
    contactCatalogLabel(locale, subcategoryId, subcategoryLabel),
  );
}
