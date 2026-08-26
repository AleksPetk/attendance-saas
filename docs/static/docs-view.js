const NAV_GROUP_ORDER = ["home", "getting_started", "using", "help", "legal"];

export function slugFromPath(path) {
  const normalized = String(path || "/").replace(/\/+$/, "") || "/";
  if (normalized === "/" || normalized === "/documentation") return "documentation";
  return normalized.replace(/^\//, "");
}

export function hrefForDocument(doc) {
  if (!doc) return "/";
  if (doc.slug === "documentation" || doc.nav_group === "home") return "/";
  return `/${doc.slug}`;
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
