import enPromo from "./promo/locales/en/promo.json" with { type: "json" };
import jaPromo from "./promo/locales/ja/promo.json" with { type: "json" };

/**
 * Resolve Contact category/subcategory display labels from the shared promo
 * catalog strings (same IDs the Contact API allowlists).
 */
export function contactCatalogLabel(locale, id, fallback = "") {
  const map =
    (locale === "ja" ? jaPromo : enPromo).contact?.catalogLabels || {};
  const key = String(id || "").trim();
  if (!key) return fallback || "";
  return map[key] || fallback || key;
}
