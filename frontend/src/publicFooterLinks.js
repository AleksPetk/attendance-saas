/**
 * Planned V1 public-footer columns.
 *
 * Items with `to` use an existing public route.
 * Items with `href` use an external origin (Docs or Status).
 * Support opens Docs in a new tab. Contact stays on this site.
 */

export function publicStatusPageUrl() {
  const raw =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_STATUS_PUBLIC_URL) ||
    "";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  return trimmed || "http://localhost:8090";
}

/** Standalone Status URL using the current workspace UI locale (not status-site preference). */
export function workspaceStatusHomeUrl(locale) {
  const base = publicStatusPageUrl();
  const lang = locale === "ja" ? "ja" : "en";
  return `${base}/${lang}/`;
}

export function publicDocsPageUrl() {
  const raw =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_DOCS_PUBLIC_URL) ||
    "";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  return trimmed || "http://localhost:8091";
}

export function publicDocsDocumentUrl(slug, locale) {
  const base = publicDocsPageUrl();
  const key = String(slug || "").trim().replace(/^\/+|\/+$/g, "");
  const lang = locale === "ja" ? "ja" : locale === "en" ? "en" : "";
  const prefix = lang ? `/${lang}` : "";
  if (!key || key === "documentation") return `${base}${prefix}/`;
  return `${base}${prefix}/${key}`;
}

/** Standalone Docs URL using the current workspace UI locale (not docs-site preference). */
export function workspaceDocsDocumentUrl(slug, locale) {
  return publicDocsDocumentUrl(slug, locale || "en");
}

export function workspaceDocsHomeUrl(locale) {
  return workspaceDocsDocumentUrl("documentation", locale);
}

export const PUBLIC_FOOTER_COLUMNS = [
  {
    id: "website",
    title: "Website",
    items: [
      { id: "features", label: "Features", to: "/features" },
      { id: "how-it-works", label: "How it works", to: "/how-it-works" },
      { id: "pricing", label: "Pricing", to: "/pricing" },
      { id: "login", label: "Login", to: "/login" },
      { id: "staff-login", label: "Staff login", to: "/staff-login" },
      { id: "get-started", label: "Get started", to: "/register" },
    ],
  },
  {
    id: "docs",
    title: "Docs",
    items: [
      {
        id: "documentation",
        label: "Documentation",
        href: publicDocsPageUrl(),
        external: true,
      },
      {
        id: "getting-started",
        label: "Getting started",
        href: publicDocsDocumentUrl("getting-started"),
        external: true,
      },
      {
        id: "kiosk-setup",
        label: "Kiosk setup",
        href: publicDocsDocumentUrl("kiosk-setup"),
        external: true,
      },
      {
        id: "groups-members",
        label: "Groups & Members",
        href: publicDocsDocumentUrl("groups-members"),
        external: true,
      },
      {
        id: "billing-plans",
        label: "Billing & Plans",
        href: publicDocsDocumentUrl("billing-plans"),
        external: true,
      },
      {
        id: "faq",
        label: "FAQ",
        href: publicDocsDocumentUrl("faq"),
        external: true,
      },
    ],
  },
  {
    id: "usage",
    title: "Usage",
    items: [
      {
        id: "privacy",
        label: "Privacy Policy",
        href: publicDocsDocumentUrl("privacy-policy"),
        external: true,
      },
      {
        id: "terms",
        label: "Terms of Use",
        href: publicDocsDocumentUrl("terms-of-use"),
        external: true,
      },
      { id: "support", label: "Support", href: publicDocsDocumentUrl("support"), external: true },
      { id: "contact", label: "Contact", to: "/contact" },
      { id: "status", label: "Status", href: publicStatusPageUrl(), external: true },
    ],
  },
];

export function footerItemIsLinked(item) {
  if (typeof item?.href === "string" && item.href.length > 0) return true;
  return typeof item?.to === "string" && item.to.length > 0;
}

/** Split items into two columns (left filled first, then right). */
export function splitFooterItemsIntoColumns(items) {
  const list = Array.isArray(items) ? items : [];
  const mid = Math.ceil(list.length / 2);
  return [list.slice(0, mid), list.slice(mid)];
}
