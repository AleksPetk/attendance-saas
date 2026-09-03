import { docsPathFor } from "./locale.js";

const NAV_GROUP_ORDER = ["home", "getting_started", "using", "help", "legal"];

export function localeFromPath(path) {
  const normalized = String(path || "/").replace(/\/+$/, "") || "/";
  const match = normalized.match(/^\/(en|ja)(?:\/|$)/);
  return match ? match[1] : null;
}

export function slugFromPath(path) {
  const normalized = String(path || "/").replace(/\/+$/, "") || "/";
  const withoutLocale = normalized.replace(/^\/(en|ja)(?=\/|$)/, "") || "/";
  if (withoutLocale === "/" || withoutLocale === "/documentation") return "documentation";
  return withoutLocale.replace(/^\//, "");
}

export function hrefForDocument(doc, locale = "en") {
  if (!doc) return docsPathFor("documentation", locale);
  if (doc.slug === "documentation" || doc.nav_group === "home") {
    return docsPathFor("documentation", locale);
  }
  return docsPathFor(doc.slug, locale);
}

export function groupDocuments(documents) {
  const groups = new Map();
  for (const doc of documents || []) {
    const key = doc.nav_group || "home";
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: doc.nav_group_label || key,
        items: [],
      });
    }
    groups.get(key).items.push(doc);
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }
  return NAV_GROUP_ORDER.map((id) => groups.get(id)).filter(Boolean);
}
