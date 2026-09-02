import enPromo from "./locales/en/promo.json" with { type: "json" };
import jaPromo from "./locales/ja/promo.json" with { type: "json" };
import { fillPromoTemplate, normalizePromoLocale } from "./locale.js";

const CATALOGS = {
  en: enPromo,
  ja: jaPromo,
};

function lookup(root, path) {
  const parts = String(path || "")
    .split(".")
    .filter(Boolean);
  let current = root;
  for (const part of parts) {
    const indexMatch = /^(.+)\[(\d+)\]$/.exec(part);
    if (indexMatch) {
      current = current?.[indexMatch[1]];
      current = Array.isArray(current) ? current[Number(indexMatch[2])] : undefined;
    } else {
      current = current?.[part];
    }
    if (current == null) return undefined;
  }
  return current;
}

export function promoCatalog(locale) {
  const lang = normalizePromoLocale(locale);
  return CATALOGS[lang] || CATALOGS.en;
}

export function promoTranslate(locale, key, values) {
  const catalog = promoCatalog(locale);
  const fallback = CATALOGS.en;
  const raw = lookup(catalog, key);
  const value = raw == null ? lookup(fallback, key) : raw;
  if (value == null) return key;
  if (typeof value === "string") return fillPromoTemplate(value, values);
  return value;
}

export function countPromoStrings(locale = "en") {
  const catalog = promoCatalog(locale);
  let count = 0;
  function walk(node) {
    if (typeof node === "string") {
      count += 1;
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  }
  walk(catalog);
  return count;
}
