import { createElement } from "react";

const INTERNAL_DOCUMENT_PATH = /^\/(?:[a-z0-9-]+)?$/i;
const SAFE_FRAGMENT = /^#[a-z0-9][a-z0-9_-]*$/i;
const SAFE_MAILTO = /^mailto:[^\s<>]+$/i;
const INLINE_TOKEN = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

export function classifyContentHref(value) {
  const href = String(value || "").trim();
  if (!href) return { kind: "unsafe" };
  if (SAFE_FRAGMENT.test(href)) return { kind: "fragment", href };
  if (INTERNAL_DOCUMENT_PATH.test(href)) {
    const slug = href === "/" ? "documentation" : href.slice(1);
    return {
      kind: "internal-document",
      slug,
      href: `/account/info?document=${encodeURIComponent(slug)}`,
    };
  }
  if (SAFE_MAILTO.test(href)) return { kind: "external", href };
  if (href.startsWith("//")) return { kind: "unsafe" };
  try {
    const parsed = new URL(href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { kind: "external", href };
    }
  } catch {
    // Unsupported or relative links are intentionally rendered as plain text.
  }
  return { kind: "unsafe" };
}

export function slugifyContentHeading(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function stripLeadingDocumentTitle(markdown, title) {
  const source = String(markdown || "");
  const firstLineEnd = source.indexOf("\n");
  const firstLine = (firstLineEnd >= 0 ? source.slice(0, firstLineEnd) : source).trim();
  if (firstLine !== `# ${String(title || "").trim()}`) return source;
  return (firstLineEnd >= 0 ? source.slice(firstLineEnd + 1) : "").replace(/^\s+/, "");
}

function internalLinkClick(event, slug, onDocumentNavigate) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  onDocumentNavigate(slug);
}

function renderInline(text, keyPrefix, onDocumentNavigate, internalDocumentHref) {
  const source = String(text || "");
  const nodes = [];
  let cursor = 0;
  let index = 0;

  for (const match of source.matchAll(INLINE_TOKEN)) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-inline-${index}`;
    index += 1;

    if (token.startsWith("`")) {
      nodes.push(createElement("code", { key }, token.slice(1, -1)));
    } else if (token.startsWith("**")) {
      nodes.push(createElement("strong", { key }, token.slice(2, -2)));
    } else if (token.startsWith("*")) {
      nodes.push(createElement("em", { key }, token.slice(1, -1)));
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const label = link?.[1] || token;
      const target = classifyContentHref(link?.[2]);
      if (target.kind === "unsafe") {
        nodes.push(createElement("span", { key }, label));
      } else if (target.kind === "internal-document") {
        const internalHref =
          typeof internalDocumentHref === "function"
            ? internalDocumentHref(target.slug)
            : target.href;
        nodes.push(
          createElement(
            "a",
            {
              key,
              href: internalHref,
              onClick:
                typeof onDocumentNavigate === "function"
                  ? (event) => internalLinkClick(event, target.slug, onDocumentNavigate)
                  : undefined,
            },
            label,
          ),
        );
      } else if (target.kind === "external") {
        nodes.push(
          createElement(
            "a",
            { key, href: target.href, target: "_blank", rel: "noopener noreferrer" },
            label,
          ),
        );
      } else {
        nodes.push(createElement("a", { key, href: target.href }, label));
      }
    }
    cursor = match.index + token.length;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

function tableCells(line) {
  return String(line || "")
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line) {
  const cells = tableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function ContentMarkdown({
  markdown,
  onDocumentNavigate,
  internalDocumentHref,
  className = "",
}) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  const headingIds = new Set();
  let paragraph = [];
  let list = null;
  let blockIndex = 0;

  const nextKey = (kind) => `${kind}-${blockIndex++}`;

  function headingId(text) {
    const base = slugifyContentHeading(text) || "section";
    let id = base;
    let suffix = 2;
    while (headingIds.has(id)) id = `${base}-${suffix++}`;
    headingIds.add(id);
    return id;
  }

  function flushParagraph() {
    if (!paragraph.length) return;
    const key = nextKey("paragraph");
    blocks.push(
      createElement(
        "p",
        { key },
        renderInline(paragraph.join(" "), key, onDocumentNavigate, internalDocumentHref),
      ),
    );
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    const key = nextKey(list.ordered ? "ordered-list" : "list");
    blocks.push(
      createElement(
        list.ordered ? "ol" : "ul",
        { key },
        list.items.map((item, index) =>
          createElement(
            "li",
            { key: `${key}-${index}` },
            renderInline(item, `${key}-${index}`, onDocumentNavigate, internalDocumentHref),
          ),
        ),
      ),
    );
    list = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^```/.test(line)) {
      flushParagraph();
      flushList();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push(
        createElement("pre", { key: nextKey("code") }, createElement("code", null, code.join("\n"))),
      );
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      flushParagraph();
      flushList();
      const headers = tableCells(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      const key = nextKey("table");
      blocks.push(
        createElement(
          "div",
          { className: "account-info-table-wrap", key },
          createElement(
            "table",
            null,
            createElement(
              "thead",
              null,
              createElement(
                "tr",
                null,
                headers.map((cell, cellIndex) =>
                  createElement(
                    "th",
                    { key: `${key}-head-${cellIndex}` },
                    renderInline(
                      cell,
                      `${key}-head-${cellIndex}`,
                      onDocumentNavigate,
                      internalDocumentHref,
                    ),
                  ),
                ),
              ),
            ),
            createElement(
              "tbody",
              null,
              rows.map((row, rowIndex) =>
                createElement(
                  "tr",
                  { key: `${key}-row-${rowIndex}` },
                  headers.map((_, cellIndex) =>
                    createElement(
                      "td",
                      { key: `${key}-cell-${rowIndex}-${cellIndex}` },
                      renderInline(
                        row[cellIndex] || "",
                        `${key}-cell-${rowIndex}-${cellIndex}`,
                        onDocumentNavigate,
                        internalDocumentHref,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const key = nextKey("heading");
      blocks.push(
        createElement(
          `h${level}`,
          { key, id: headingId(text) },
          renderInline(text, key, onDocumentNavigate, internalDocumentHref),
        ),
      );
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(createElement("hr", { key: nextKey("rule") }));
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      const key = nextKey("quote");
      blocks.push(
        createElement(
          "blockquote",
          { key },
          createElement(
            "p",
            null,
            renderInline(quote[1], key, onDocumentNavigate, internalDocumentHref),
          ),
        ),
      );
      continue;
    }

    const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push((ordered || unordered)[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return createElement(
    "div",
    { className: ["account-info-markdown", className].filter(Boolean).join(" ") },
    blocks,
  );
}
