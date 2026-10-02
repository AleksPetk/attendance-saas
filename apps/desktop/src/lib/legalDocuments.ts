const LEGAL_SLUGS = new Set(["terms-of-use", "privacy-policy"]);

/** Resolve a content document slug from an in-document href (same contract as Mobile). */
export function legalSlugFromHref(value: string): string | null {
  const raw = String(value || "").trim();
  if (LEGAL_SLUGS.has(raw)) return raw;
  try {
    const url = raw.startsWith("/") ? new URL(raw, "https://checkstation.app") : new URL(raw);
    const slug = url.pathname.split("/").filter(Boolean).at(-1) || "";
    return LEGAL_SLUGS.has(slug) ? slug : null;
  } catch {
    return null;
  }
}

export const LEGAL_DOCUMENTS = {
  terms: "terms-of-use",
  privacy: "privacy-policy",
} as const;
