import { escapeHtml } from "./markdown.js";
import { hrefForDocument } from "./docs-view.js";

export function faqCountLabel(count) {
  const n = Number(count) || 0;
  return `${n} matching ${n === 1 ? "answer" : "answers"}`;
}

export function nextExclusiveOpenId(currentOpenId, clickedId) {
  if (!clickedId) return currentOpenId || null;
  if (currentOpenId === clickedId) return null;
  return clickedId;
}

export function applyExclusiveOpen(items, clickedId) {
  const list = Array.isArray(items) ? items : [];
  const currentOpenId = list.find((item) => item.expanded)?.id || null;
  const nextId = nextExclusiveOpenId(currentOpenId, clickedId);
  return list.map((item) => ({
    ...item,
    expanded: item.id === nextId,
  }));
}

export function relatedGuideMeta(slug, documents) {
  const key = String(slug || "").trim().replace(/^\/+|\/+$/g, "");
  if (!key) return null;
  const doc = (documents || []).find((item) => item.slug === key);
  return {
    href: hrefForDocument(doc || { slug: key }),
    label: (doc && doc.title) || key,
  };
}

export function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightEscapedText(escaped, tokens) {
  const source = String(escaped || "");
  const usable = (tokens || []).filter((token) => String(token).length >= 2);
  if (!source || !usable.length) return source;
  const pattern = usable
    .map((token) => escapeRegExp(token))
    .sort((a, b) => b.length - a.length)
    .join("|");
  if (!pattern) return source;
  return source.replace(
    new RegExp(`(${pattern})`, "gi"),
    '<mark class="faq-mark">$1</mark>',
  );
}

export function setFaqItemExpanded(button, panel, expanded) {
  const isOpen = Boolean(expanded);
  if (button) {
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    const item = button.closest ? button.closest(".faq-item") : null;
    if (item && item.classList) item.classList.toggle("is-open", isOpen);
  }
  if (panel) panel.hidden = !isOpen;
}

export function toggleFaqExclusive(buttons, clicked, findPanel) {
  if (!clicked) return null;
  const list = [...(buttons || [])];
  const wasOpen = clicked.getAttribute("aria-expanded") === "true";
  for (const button of list) {
    const panel = findPanel
      ? findPanel(button.getAttribute("aria-controls"))
      : null;
    setFaqItemExpanded(button, panel, false);
  }
  if (!wasOpen) {
    const panel = findPanel
      ? findPanel(clicked.getAttribute("aria-controls"))
      : null;
    setFaqItemExpanded(clicked, panel, true);
    return clicked.id || clicked.getAttribute("id") || null;
  }
  return null;
}
