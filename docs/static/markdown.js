const EXTERNAL_HREF = /^(https?:|mailto:)/i;
const FRAGMENT_HREF = /^#/;
const INTERNAL_DOC_HREF = /^\/[a-z0-9-]*$/i;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function slugifyHeading(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isSafeHref(href) {
  const trimmed = String(href || "").trim();
  return (
    EXTERNAL_HREF.test(trimmed) ||
    FRAGMENT_HREF.test(trimmed) ||
    INTERNAL_DOC_HREF.test(trimmed)
  );
}

function isInternalDocHref(href) {
  const trimmed = String(href || "").trim();
  return FRAGMENT_HREF.test(trimmed) || INTERNAL_DOC_HREF.test(trimmed);
}

function inlineMarkdown(escaped) {
  let text = escaped;
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^\*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
    if (!isSafeHref(href)) {
      return label;
    }
    if (isInternalDocHref(href)) {
      return `<a href="${href}">${label}</a>`;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return text;
}

export function extractHeadings(source) {
  const headings = [];
  const used = new Set();
  for (const line of String(source || "").split(/\r?\n/)) {
    const match = /^(#{2,3})\s+(.+)$/.exec(line);
    if (!match) continue;
    const text = match[2].trim();
    let id = slugifyHeading(text);
    if (!id) continue;
    let unique = id;
    let n = 2;
    while (used.has(unique)) {
      unique = `${id}-${n}`;
      n += 1;
    }
    used.add(unique);
    headings.push({ level: match[1].length, id: unique, text });
  }
  return headings;
}

export function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const usedIds = new Set();
  let paragraph = [];
  let listType = null;

  function headingId(text) {
    let id = slugifyHeading(text);
    if (!id) return "";
    let unique = id;
    let n = 2;
    while (usedIds.has(unique)) {
      unique = `${id}-${n}`;
      n += 1;
    }
    usedIds.add(unique);
    return unique;
  }

  function flushParagraph() {
    if (!paragraph.length) return;
    const text = inlineMarkdown(escapeHtml(paragraph.join(" ")));
    html.push(`<p>${text}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType) return;
    html.push(listType === "ol" ? "</ol>" : "</ul>");
    listType = null;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = /^```/.test(line);
    if (fence) {
      flushParagraph();
      flushList();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
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
      const id = headingId(text);
      html.push(
        `<h${level} id="${id}">${inlineMarkdown(escapeHtml(text))}</h${level}>`,
      );
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      html.push("<hr />");
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      html.push(`<blockquote><p>${inlineMarkdown(escapeHtml(line.replace(/^>\s?/, "")))}</p></blockquote>`);
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inlineMarkdown(escapeHtml(ul[1]))}</li>`);
      continue;
    }
    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inlineMarkdown(escapeHtml(ol[1]))}</li>`);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return html.join("\n");
}
