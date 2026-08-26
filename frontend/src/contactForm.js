export const SUBJECT_MIN = 8;
export const SUBJECT_MAX = 120;
export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 4000;
export const HONEYPOT_FIELD = "company_url";

export function suggestedSubject(categoryLabel, subcategoryLabel) {
  const category = String(categoryLabel || "").trim();
  const sub = String(subcategoryLabel || "").trim();
  if (!category || !sub) return "";
  const text = `${category}: ${sub}`;
  return text.slice(0, SUBJECT_MAX);
}

export function publicFaqUrl(docsBase, question) {
  const base = String(docsBase || "").replace(/\/+$/, "");
  const query = String(question || "").trim();
  if (!base) return "";
  if (!query) return `${base}/faq`;
  return `${base}/faq?q=${encodeURIComponent(query)}`;
}

export function publicSiteOrigin() {
  const raw =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_PUBLIC_SITE_URL) ||
    "";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  if (trimmed) return trimmed;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}
