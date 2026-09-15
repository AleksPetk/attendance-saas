/** Shared authenticated Contact form helpers (browser Workspace + Desktop Help). */

export const SUBJECT_MIN = 8;
export const SUBJECT_MAX = 120;
export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 4000;
export const HONEYPOT_FIELD = "company_url";

export function suggestedSubject(categoryLabel: string, subcategoryLabel: string): string {
  const category = String(categoryLabel || "").trim();
  const sub = String(subcategoryLabel || "").trim();
  if (!category || !sub) return "";
  return `${category}: ${sub}`.slice(0, SUBJECT_MAX);
}

export function publicFaqUrl(docsBase: string, question?: string): string {
  const base = String(docsBase || "").replace(/\/+$/, "");
  const query = String(question || "").trim();
  if (!base) return "";
  if (!query) return `${base}/faq`;
  return `${base}/faq?q=${encodeURIComponent(query)}`;
}
