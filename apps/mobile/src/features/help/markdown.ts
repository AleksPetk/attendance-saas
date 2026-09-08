const INTERNAL_DOCUMENT_PATH = /^\/(?:[a-z0-9-]+)?$/i;
const SAFE_MAILTO = /^mailto:[^\s<>]+$/i;

export type ContentLink =
  | { kind: "internal-document"; slug: string }
  | { kind: "external"; href: string }
  | { kind: "fragment" }
  | { kind: "unsafe" };

export function classifyContentHref(value: string): ContentLink {
  const href = String(value || "").trim();
  if (/^#[a-z0-9][a-z0-9_-]*$/i.test(href)) return { kind: "fragment" };
  if (INTERNAL_DOCUMENT_PATH.test(href)) return { kind: "internal-document", slug: href === "/" ? "documentation" : href.slice(1) };
  if (SAFE_MAILTO.test(href)) return { kind: "external", href };
  if (!href || href.startsWith("//")) return { kind: "unsafe" };
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") return { kind: "external", href };
  } catch { /* Unsupported relative links stay inert. */ }
  return { kind: "unsafe" };
}

export function stripLeadingDocumentTitle(markdown: string, title: string) {
  const source = String(markdown || "");
  const end = source.indexOf("\n");
  const first = (end >= 0 ? source.slice(0, end) : source).trim();
  if (first !== `# ${String(title || "").trim()}`) return source;
  return (end >= 0 ? source.slice(end + 1) : "").replace(/^\s+/, "");
}
