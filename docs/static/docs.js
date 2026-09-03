import { extractHeadings, escapeHtml, renderMarkdown } from "./markdown.js";
import {
  groupDocuments,
  hrefForDocument,
  localeFromPath,
  slugFromPath,
} from "./docs-view.js";
import {
  docsPathFor,
  docsUi,
  resolveDocsLocale,
  resolveInitialDocsLocale,
  saveDocsLocalePreference,
  supportPopularCategories,
} from "./locale.js";
import { mountDocsLanguageMenu } from "./language-menu.js";
import {
  filterFaqEntries,
  groupFaqByCategory,
  searchQueryFromSearch,
  tokenizeQuery,
} from "./faq-search.js";
import {
  faqCountLabel,
  highlightEscapedText,
  relatedGuideMeta,
  toggleFaqExclusive,
} from "./faq-view.js";
import {
  contactHref,
  featuredQuestions,
  statusApiUrl,
  statusSummary,
  statusTone,
} from "./support-view.js";

function config() {
  return window.DOCS_CONFIG || {
    apiBaseUrl: "http://localhost:8000",
    publicUrl: "http://localhost:8091",
    mainSiteUrl: "http://localhost:5173",
    statusPublicUrl: "http://localhost:8090",
  };
}

function apiUrl(path) {
  return `${String(config().apiBaseUrl || "").replace(/\/+$/, "")}${path}`;
}

function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path;
}

function currentLocale(path = currentPath()) {
  return resolveDocsLocale(path) || resolveInitialDocsLocale(path);
}

function faqPathForLocale(query, locale) {
  const base = docsPathFor("faq", locale);
  const trimmed = String(query || "").trim();
  if (!trimmed) return base;
  return `${base}?q=${encodeURIComponent(trimmed)}`;
}

function supportPathForLocale(query, locale) {
  const base = docsPathFor("support", locale);
  const trimmed = String(query || "").trim();
  if (!trimmed) return base;
  return `${base}?q=${encodeURIComponent(trimmed)}`;
}

function ensureLocalePath(path) {
  const normalized = String(path || "/").replace(/\/+$/, "") || "/";
  if (normalized === "/") {
    const locale = resolveInitialDocsLocale(normalized);
    const target = docsPathFor("documentation", locale);
    window.location.replace(target);
    return null;
  }
  if (!localeFromPath(normalized)) {
    const locale = resolveInitialDocsLocale(normalized);
    const slug = slugFromPath(normalized);
    const target = docsPathFor(slug, locale);
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    window.location.replace(`${target}${search}${hash}`);
    return null;
  }
  return normalized;
}

function formatDate(value, locale) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const lang = locale === "ja" ? "ja" : "en";
  return new Intl.DateTimeFormat(lang, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

async function fetchJson(path, locale) {
  const separator = path.includes("?") ? "&" : "?";
  const localizedPath = `${path}${separator}lang=${encodeURIComponent(locale)}`;
  const response = await fetch(apiUrl(localizedPath), {
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error("document_fetch_failed");
  }
  return response.json();
}

function setHreflangAlternates(alternateUrls) {
  for (const existing of window.document.querySelectorAll('link[rel="alternate"][hreflang]')) {
    existing.remove();
  }
  for (const alternate of alternateUrls || []) {
    const language = alternate && alternate.language;
    const href = alternate && alternate.href;
    if (!language || !href) continue;
    const link = window.document.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", language);
    link.setAttribute("href", href);
    window.document.head.appendChild(link);
  }
}

function setMeta(documentData, locale) {
  const ui = docsUi(locale);
  const title =
    documentData && documentData.slug !== "documentation"
      ? `${documentData.title} · ${ui.siteTitle}`
      : ui.siteTitle;
  window.document.title = title;
  const description =
    (documentData && documentData.description) || ui.defaultDescription;
  let meta = window.document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = window.document.createElement("meta");
    meta.setAttribute("name", "description");
    window.document.head.appendChild(meta);
  }
  meta.setAttribute("content", description);
  let canonical = window.document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = window.document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    window.document.head.appendChild(canonical);
  }
  const href =
    (documentData && documentData.canonical_url) ||
    `${String(config().publicUrl || "").replace(/\/+$/, "")}${hrefForDocument(documentData, locale)}`;
  if (href) canonical.setAttribute("href", href);
  setHreflangAlternates(documentData && documentData.alternate_urls);
}

function renderNav(documents, activeSlug, locale) {
  const ui = docsUi(locale);
  const groups = groupDocuments(documents);
  const nav = window.document.getElementById("sidebar-nav");
  if (!groups.length) {
    nav.innerHTML = `<p class="docs-nav-loading">${escapeHtml(ui.noPublishedDocuments)}</p>`;
    return;
  }
  nav.innerHTML = groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          const href = hrefForDocument(item, locale);
          const active = item.slug === activeSlug ? " active" : "";
          return `<li><a class="docs-nav-link${active}" href="${escapeHtml(href)}" data-slug="${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a></li>`;
        })
        .join("");
      return `<section class="docs-nav-group">
        <h2 class="docs-nav-title">${escapeHtml(group.label)}</h2>
        <ul class="docs-nav-list">${items}</ul>
      </section>`;
    })
    .join("");
}

function renderToc(source, locale) {
  const ui = docsUi(locale);
  const headings = extractHeadings(source);
  if (headings.length < 4) return "";
  const items = headings
    .map(
      (item) =>
        `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a></li>`,
    )
    .join("");
  return `<nav class="docs-toc" aria-label="${escapeHtml(ui.onThisPage)}"><h2>${escapeHtml(ui.onThisPage)}</h2><ol>${items}</ol></nav>`;
}

function renderHomeIndex(documents, locale) {
  const groups = groupDocuments(documents).filter((group) => group.id !== "home");
  if (!groups.length) return "";
  return `<div class="docs-home-index">${groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          const desc = item.description
            ? `<p>${escapeHtml(item.description)}</p>`
            : "";
          return `<a href="${escapeHtml(hrefForDocument(item, locale))}">${escapeHtml(item.title)}</a>${desc}`;
        })
        .join("");
      return `<section class="docs-home-card"><h2>${escapeHtml(group.label)}</h2>${items}</section>`;
    })
    .join("")}</div>`;
}

function renderMeta(documentData, locale) {
  const ui = docsUi(locale);
  const bits = [];
  if (documentData.version) {
    bits.push(`${ui.versionLabel} ${escapeHtml(documentData.version)}`);
  }
  if (documentData.effective_on) {
    bits.push(
      `${ui.effectiveLabel} ${escapeHtml(formatDate(documentData.effective_on, locale))}`,
    );
  }
  if (documentData.updated_at) {
    bits.push(
      `${ui.updatedLabel} ${escapeHtml(formatDate(documentData.updated_at, locale))}`,
    );
  }
  if (!bits.length) return "";
  return `<p class="docs-meta">${bits.map((bit) => `<span>${bit}</span>`).join("")}</p>`;
}

function stripTitle(rawBody, title) {
  return (rawBody || "").replace(
    new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*\\n+`),
    "",
  );
}

function renderArticle(documentData, documents, locale) {
  const title = documentData.title || "";
  const stripped = stripTitle(documentData.body_markdown || "", title);
  const body = renderMarkdown(stripped);
  const toc = documentData.slug === "documentation" ? "" : renderToc(stripped, locale);
  const index =
    documentData.slug === "documentation" ? renderHomeIndex(documents, locale) : "";
  const lede = documentData.description
    ? `<p class="docs-lede">${escapeHtml(documentData.description)}</p>`
    : "";
  return `${renderMeta(documentData, locale)}
    <h1>${escapeHtml(documentData.title)}</h1>
    ${lede}
    ${toc}
    <article class="docs-prose">${body}</article>
    ${index}`;
}

function faqItemHtml(entry, { expanded, documents, query, instanceId, locale }) {
  const ui = docsUi(locale);
  const slug = escapeHtml(entry.slug);
  const uid = escapeHtml(instanceId || entry.slug);
  const hidden = expanded ? "" : " hidden";
  const expandedAttr = expanded ? "true" : "false";
  const openClass = expanded ? " is-open" : "";
  const questionHtml = highlightEscapedText(
    escapeHtml(entry.question),
    tokenizeQuery(query),
  );
  const related = relatedGuideMeta(entry.related_document_slug, documents, locale);
  const relatedHtml = related
    ? `<p class="faq-related"><a class="faq-related-link" href="${escapeHtml(related.href)}">${escapeHtml(ui.relatedGuide)} <span aria-hidden="true">→</span> ${escapeHtml(related.label)}</a></p>`
    : "";
  return `<article class="faq-item${openClass}" data-faq-slug="${slug}">
    <h3 class="faq-item-title">
      <button type="button" class="faq-question" id="faq-q-${uid}" aria-expanded="${expandedAttr}" aria-controls="faq-a-${uid}">
        <span class="faq-question-text">${questionHtml}</span>
        <svg class="faq-chevron" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M5.4 7.5 10 12.1l4.6-4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </h3>
    <div class="faq-answer" id="faq-a-${uid}" role="region" aria-labelledby="faq-q-${uid}"${hidden}>
      <div class="docs-prose faq-answer-body">${renderMarkdown(entry.answer_markdown || "")}${relatedHtml}</div>
    </div>
  </article>`;
}

function renderFaqList(entries, { expandSingle, documents, query, instancePrefix, locale }) {
  const expandAll = Boolean(expandSingle) && entries.length === 1;
  return entries
    .map((entry, index) =>
      faqItemHtml(entry, {
        expanded: expandAll,
        documents,
        query,
        locale,
        instanceId: `${instancePrefix || "faq"}-${entry.slug || index}`,
      }),
    )
    .join("");
}

function renderFaqChips(categories, activeId) {
  return categories
    .map((category) => {
      const active = category.id === activeId;
      const current = active ? ` aria-current="location"` : "";
      const on = active ? " is-active" : "";
      return `<a class="faq-chip${on}" href="#faq-cat-${escapeHtml(category.id)}" data-faq-chip="${escapeHtml(category.id)}"${current}>${escapeHtml(category.label)}</a>`;
    })
    .join("");
}

function renderFaqPage(documentData, faqPayload, query, documents, locale) {
  const ui = docsUi(locale);
  const title = documentData.title || "FAQ";
  const stripped = stripTitle(documentData.body_markdown || "", title);
  const intro = renderMarkdown(stripped);
  const categories = (faqPayload && faqPayload.categories) || [];
  const allEntries = (faqPayload && faqPayload.entries) || [];
  const filtered = filterFaqEntries(allEntries, query);
  const value = escapeHtml(query);
  const chips = renderFaqChips(categories, "");
  const listOptions = { documents, query, locale };
  const supportHref = docsPathFor("support", locale);
  let body = "";
  if (filtered.mode === "search") {
    if (!filtered.items.length) {
      body = `<div class="faq-empty" role="status">
        <p><strong>${escapeHtml(ui.noMatchingAnswers)}</strong></p>
        <p>${escapeHtml(ui.noMatchingAnswersHint)} <a href="${escapeHtml(supportHref)}">${escapeHtml(ui.supportLink)}</a>.</p>
      </div>`;
    } else {
      body = `<p class="faq-count">${faqCountLabel(filtered.items.length, locale)}</p>
        <div class="faq-results">${renderFaqList(filtered.items, { ...listOptions, expandSingle: true, instancePrefix: "search" })}</div>`;
    }
  } else {
    const featured = allEntries.filter((entry) => entry.featured);
    const groups = groupFaqByCategory(allEntries, categories);
    const popular = featured.length
      ? `<section class="faq-group" id="faq-popular">
          <h2>${escapeHtml(ui.popularQuestions)}</h2>
          ${renderFaqList(featured, { ...listOptions, expandSingle: false, instancePrefix: "popular" })}
        </section>`
      : "";
    body = `${popular}${groups
      .map(
        (group) => `<section class="faq-group" id="faq-cat-${escapeHtml(group.id)}">
          <h2>${escapeHtml(group.label)}</h2>
          ${renderFaqList(group.items, { ...listOptions, expandSingle: false, instancePrefix: group.id })}
        </section>`,
      )
      .join("")}`;
  }
  const clearHidden = query.trim() ? "" : " hidden";
  const faqAction = docsPathFor("faq", locale);
  return `${renderMeta(documentData, locale)}
    <h1>${escapeHtml(title)}</h1>
    <p class="docs-lede">${escapeHtml(ui.faqLede)}</p>
    <article class="docs-prose faq-intro">${intro}</article>
    <div class="faq-toolbar">
    <form class="faq-search" role="search" action="${escapeHtml(faqAction)}" method="get">
      <label class="faq-search-label" for="faq-search">${escapeHtml(ui.searchLabel)}</label>
      <div class="faq-search-row">
        <input
          id="faq-search"
          name="q"
          type="search"
          value="${value}"
          placeholder="${escapeHtml(ui.searchPlaceholder)}"
          autocomplete="off"
          enterkeyhint="search"
        />
        <button type="button" class="faq-search-clear" id="faq-search-clear"${clearHidden}>${escapeHtml(ui.clear)}</button>
      </div>
    </form>
    <nav class="faq-chips" aria-label="${escapeHtml(ui.faqCategoriesAria)}">${chips}</nav>
    </div>
    <div class="faq-body">${body}</div>`;
}

function bindFaqSearch(locale) {
  bindHelpSearch({
    inputId: "faq-search",
    clearId: "faq-search-clear",
    basePath: docsPathFor("faq", locale),
    pathForQuery: (query) => faqPathForLocale(query, locale),
    refresh: refreshFaqResults,
  });
}

function bindSupportSearch(locale) {
  bindHelpSearch({
    inputId: "support-search",
    clearId: "support-search-clear",
    basePath: docsPathFor("support", locale),
    pathForQuery: (query) => supportPathForLocale(query, locale),
    refresh: refreshSupportResults,
  });
}

function bindHelpSearch({ inputId, clearId, basePath, pathForQuery, refresh }) {
  const input = window.document.getElementById(inputId);
  if (!input) return;
  const form = input.closest("form");
  if (form) {
    form.addEventListener("submit", (event) => event.preventDefault());
  }
  input.addEventListener("input", () => {
    const next = pathForQuery(input.value);
    window.history.replaceState({}, "", next);
    refresh(input.value);
  });
  const clear = window.document.getElementById(clearId);
  if (clear) {
    clear.addEventListener("click", () => {
      input.value = "";
      input.focus();
      window.history.replaceState({}, "", basePath);
      refresh("");
    });
  }
}

function syncFaqChipActive(activeId) {
  for (const chip of window.document.querySelectorAll(".faq-chip")) {
    const on = Boolean(activeId) && chip.getAttribute("data-faq-chip") === activeId;
    chip.classList.toggle("is-active", on);
    if (on) chip.setAttribute("aria-current", "location");
    else chip.removeAttribute("aria-current");
  }
}

function bindFaqAccordion(root) {
  root.addEventListener("click", (event) => {
    const button = event.target.closest(".faq-question");
    if (!button || !root.contains(button)) return;
    toggleFaqExclusive(root.querySelectorAll(".faq-question"), button, (id) =>
      window.document.getElementById(id),
    );
  });
}

let faqCache = null;
let faqDocuments = [];
let faqCurrentLocale = "en";

function refreshFaqResults(query) {
  const body = window.document.querySelector(".faq-body");
  const clear = window.document.getElementById("faq-search-clear");
  if (!body || !faqCache) return;
  const ui = docsUi(faqCurrentLocale);
  const filtered = filterFaqEntries(faqCache.entries || [], query);
  const listOptions = { documents: faqDocuments, query, locale: faqCurrentLocale };
  const supportHref = docsPathFor("support", faqCurrentLocale);
  if (clear) clear.hidden = !String(query || "").trim();
  if (filtered.mode === "search") {
    syncFaqChipActive("");
    if (!filtered.items.length) {
      body.innerHTML = `<div class="faq-empty" role="status">
        <p><strong>${escapeHtml(ui.noMatchingAnswers)}</strong></p>
        <p>${escapeHtml(ui.noMatchingAnswersHint)} <a href="${escapeHtml(supportHref)}">${escapeHtml(ui.supportLink)}</a>.</p>
      </div>`;
      return;
    }
    body.innerHTML = `<p class="faq-count">${faqCountLabel(filtered.items.length, faqCurrentLocale)}</p>
      <div class="faq-results">${renderFaqList(filtered.items, { ...listOptions, expandSingle: true, instancePrefix: "search" })}</div>`;
    return;
  }
  const featured = (faqCache.entries || []).filter((entry) => entry.featured);
  const groups = groupFaqByCategory(faqCache.entries || [], faqCache.categories || []);
  const popular = featured.length
    ? `<section class="faq-group" id="faq-popular">
        <h2>${escapeHtml(ui.popularQuestions)}</h2>
        ${renderFaqList(featured, { ...listOptions, expandSingle: false, instancePrefix: "popular" })}
      </section>`
    : "";
  body.innerHTML = `${popular}${groups
    .map(
      (group) => `<section class="faq-group" id="faq-cat-${escapeHtml(group.id)}">
        <h2>${escapeHtml(group.label)}</h2>
        ${renderFaqList(group.items, { ...listOptions, expandSingle: false, instancePrefix: group.id })}
      </section>`,
    )
    .join("")}`;
}

async function fetchStatusSummary(locale) {
  const url = statusApiUrl(config().statusPublicUrl);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return statusSummary(null, locale);
    return statusSummary(await response.json(), locale);
  } catch {
    return statusSummary(null, locale);
  }
}

function renderSupportBody(faqPayload, query, documents, locale) {
  const ui = docsUi(locale);
  const allEntries = (faqPayload && faqPayload.entries) || [];
  const filtered = filterFaqEntries(allEntries, query);
  const listOptions = { documents, query, locale };
  if (filtered.mode === "search") {
    if (!filtered.items.length) {
      return `<div class="faq-empty" role="status">
        <p><strong>${escapeHtml(ui.noMatchingAnswers)}</strong></p>
        <p>${escapeHtml(ui.noMatchingAnswersSupport)}</p>
      </div>`;
    }
    return `<p class="faq-count">${faqCountLabel(filtered.items.length, locale)}</p>
      <div class="faq-results">${renderFaqList(filtered.items, { ...listOptions, expandSingle: true, instancePrefix: "support-search" })}</div>`;
  }
  const featured = featuredQuestions(allEntries, 6);
  if (!featured.length) {
    return `<p class="faq-empty" role="status">${escapeHtml(ui.helpUnavailable)}</p>`;
  }
  return `<section class="faq-group" id="support-common">
      <h2>${escapeHtml(ui.popularQuestions)}</h2>
      ${renderFaqList(featured, { ...listOptions, expandSingle: false, instancePrefix: "support-common" })}
    </section>`;
}

function renderSupportPage(documentData, faqPayload, query, documents, status, locale) {
  const ui = docsUi(locale);
  const title = documentData.title || "Support";
  const stripped = stripTitle(documentData.body_markdown || "", title);
  const intro = renderMarkdown(stripped);
  const value = escapeHtml(query);
  const clearHidden = query.trim() ? "" : " hidden";
  const faqHref = docsPathFor("faq", locale);
  const categories = supportPopularCategories(locale).map(
    (category) =>
      `<a class="faq-chip" href="${escapeHtml(faqHref)}#faq-cat-${escapeHtml(category.id)}">${escapeHtml(category.label)}</a>`,
  ).join("");
  const tone = statusTone(status.state);
  const contactUrl = escapeHtml(contactHref(config().mainSiteUrl));
  const supportAction = docsPathFor("support", locale);
  const statusLabel =
    status.state === "unavailable" ? ui.statusUnavailable : status.label;
  return `${renderMeta(documentData, locale)}
    <h1>${escapeHtml(ui.supportTitle)}</h1>
    <p class="docs-lede">${escapeHtml(ui.supportLede)}</p>
    <article class="docs-prose faq-intro">${intro}</article>
    <div class="faq-toolbar">
    <form class="faq-search" role="search" action="${escapeHtml(supportAction)}" method="get">
      <label class="faq-search-label" for="support-search">${escapeHtml(ui.searchLabel)}</label>
      <div class="faq-search-row">
        <input
          id="support-search"
          name="q"
          type="search"
          value="${value}"
          placeholder="${escapeHtml(ui.searchPlaceholder)}"
          autocomplete="off"
          enterkeyhint="search"
        />
        <button type="button" class="faq-search-clear" id="support-search-clear"${clearHidden}>${escapeHtml(ui.clear)}</button>
      </div>
    </form>
    <p class="support-categories-label">${escapeHtml(ui.popularCategories)}</p>
    <nav class="faq-chips" aria-label="${escapeHtml(ui.popularCategories)}">${categories}</nav>
    </div>
    <div class="faq-body">${renderSupportBody(faqPayload, query, documents, locale)}</div>
    <section class="support-status" aria-live="polite">
      <h2>${escapeHtml(ui.systemStatus)}</h2>
      <p class="support-status-line">
        <span class="support-status-dot ${escapeHtml(tone)}" aria-hidden="true"></span>
        <span>${escapeHtml(statusLabel)}</span>
      </p>
    </section>
    <section class="support-contact">
      <h2>${escapeHtml(ui.stillNeedHelp)}</h2>
      <p>${escapeHtml(ui.contactHint)}</p>
      <a class="support-contact-btn" href="${contactUrl}">${escapeHtml(ui.contactButton)}</a>
    </section>`;
}

function refreshSupportResults(query) {
  const body = window.document.querySelector(".faq-body");
  const clear = window.document.getElementById("support-search-clear");
  if (!body || !faqCache) return;
  if (clear) clear.hidden = !String(query || "").trim();
  body.innerHTML = renderSupportBody(faqCache, query, faqDocuments, faqCurrentLocale);
}

function closeMobileNav() {
  const sidebar = window.document.getElementById("docs-nav");
  const toggle = window.document.getElementById("nav-toggle");
  sidebar.classList.remove("open");
  sidebar.hidden = window.matchMedia("(max-width: 860px)").matches;
  toggle.setAttribute("aria-expanded", "false");
}

function syncMobileNav() {
  const sidebar = window.document.getElementById("docs-nav");
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  if (!mobile) {
    sidebar.hidden = false;
    sidebar.classList.add("open");
    return;
  }
  if (!sidebar.classList.contains("open")) {
    sidebar.hidden = true;
  }
}

let languageMenu = null;

function updateChromeLocale(locale) {
  const ui = docsUi(locale);
  window.document.documentElement.lang = locale;
  const brand = window.document.getElementById("docs-brand-link");
  if (brand) brand.setAttribute("href", docsPathFor("documentation", locale));
  const kicker = window.document.querySelector(".docs-kicker");
  if (kicker) kicker.textContent = ui.docsKicker;
  const toggle = window.document.getElementById("nav-toggle");
  if (toggle) {
    toggle.textContent = ui.menuButton;
    toggle.setAttribute("aria-label", ui.openNav);
  }
  const sidebarNav = window.document.getElementById("sidebar-nav");
  if (sidebarNav) sidebarNav.setAttribute("aria-label", ui.documentsNavAria);
  const navLoading = sidebarNav && sidebarNav.querySelector(".docs-nav-loading");
  if (navLoading) navLoading.textContent = ui.loadingDocuments;
  const mainLoading = window.document.querySelector("#docs-main .docs-loading");
  if (mainLoading) mainLoading.textContent = ui.loading;
  const menuRoot = window.document.getElementById("docs-language-root");
  if (menuRoot && languageMenu) languageMenu.update(locale);
}

async function render(path) {
  const main = window.document.getElementById("docs-main");
  const locale = currentLocale(path);
  faqCurrentLocale = locale;
  saveDocsLocalePreference(locale);
  updateChromeLocale(locale);
  const slug = slugFromPath(path);
  const ui = docsUi(locale);
  try {
    const requests = [
      fetchJson("/api/content/documents/", locale),
      fetchJson(`/api/content/documents/${encodeURIComponent(slug)}/`, locale),
    ];
    if (slug === "faq" || slug === "support") {
      requests.push(fetchJson("/api/content/faq/", locale));
    }
    const [listPayload, documentData, faqPayload] = await Promise.all(requests);
    const documents = (listPayload && listPayload.documents) || [];
    renderNav(documents, slug, locale);
    if (!documentData) {
      setMeta(
        { title: ui.documentNotAvailable, description: ui.documentNotPublished, slug: "not-found" },
        locale,
      );
      main.innerHTML = `<article class="docs-article"><h1>${escapeHtml(ui.documentNotAvailable)}</h1><p class="docs-error">${escapeHtml(ui.documentNotPublished)}</p></article>`;
      return;
    }
    setMeta(documentData, locale);
    if (slug === "faq") {
      faqCache = faqPayload || { categories: [], entries: [] };
      faqDocuments = documents;
      const query = searchQueryFromSearch(window.location.search);
      main.innerHTML = `<div class="docs-article docs-article-faq">${renderFaqPage(documentData, faqCache, query, documents, locale)}</div>`;
      bindFaqSearch(locale);
      return;
    }
    if (slug === "support") {
      faqCache = faqPayload || { categories: [], entries: [] };
      faqDocuments = documents;
      const query = searchQueryFromSearch(window.location.search);
      const status = await fetchStatusSummary(locale);
      main.innerHTML = `<div class="docs-article docs-article-support">${renderSupportPage(documentData, faqCache, query, documents, status, locale)}</div>`;
      bindSupportSearch(locale);
      return;
    }
    faqCache = null;
    faqDocuments = [];
    main.innerHTML = `<div class="docs-article">${renderArticle(documentData, documents, locale)}</div>`;
  } catch (error) {
    setMeta({ title: ui.docsUnavailable, slug: "error" }, locale);
    main.innerHTML = `<article class="docs-article"><h1>${escapeHtml(ui.docsUnavailable)}</h1><p class="docs-error">${escapeHtml(ui.docsUnavailableMessage)}</p></article>`;
  }
}

function bindNavigation() {
  const main = window.document.getElementById("docs-main");
  bindFaqAccordion(main);
  window.document.addEventListener("click", (event) => {
    const chip = event.target.closest(".faq-chip");
    if (chip && chip.getAttribute("href")?.includes("#faq-cat-")) {
      const input = window.document.getElementById("faq-search");
      if (input && input.value.trim()) {
        input.value = "";
        window.history.replaceState({}, "", docsPathFor("faq", faqCurrentLocale));
        refreshFaqResults("");
      }
      syncFaqChipActive(chip.getAttribute("data-faq-chip"));
      return;
    }
    const link = event.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    if (link.target === "_blank") return;
    if (url.pathname.startsWith("/brand/") || url.pathname.endsWith(".css") || url.pathname.endsWith(".js")) {
      return;
    }
    if (!localeFromPath(url.pathname)) {
      const slug = slugFromPath(url.pathname) || "documentation";
      url.pathname = docsPathFor(slug, faqCurrentLocale || currentLocale());
    }
    if (url.hash && url.pathname === window.location.pathname) return;
    event.preventDefault();
    window.history.pushState({}, "", url.pathname + url.search + url.hash);
    closeMobileNav();
    render(url.pathname).then(() => {
      if (url.hash) {
        const target = window.document.getElementById(url.hash.slice(1));
        if (target) target.scrollIntoView();
      } else {
        window.scrollTo(0, 0);
      }
    });
  });
  window.addEventListener("popstate", () => render(currentPath()));
  const toggle = window.document.getElementById("nav-toggle");
  toggle.addEventListener("click", () => {
    const sidebar = window.document.getElementById("docs-nav");
    const open = !sidebar.classList.contains("open") || sidebar.hidden;
    sidebar.classList.toggle("open", open);
    sidebar.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  window.matchMedia("(max-width: 860px)").addEventListener("change", syncMobileNav);
  syncMobileNav();
  const menuRoot = window.document.getElementById("docs-language-root");
  languageMenu = mountDocsLanguageMenu(menuRoot, {
    locale: currentLocale(),
    onNavigate(href) {
      window.history.pushState({}, "", href);
      closeMobileNav();
      render(href).then(() => window.scrollTo(0, 0));
    },
  });
  updateChromeLocale(currentLocale());
}

const initialPath = ensureLocalePath(currentPath());
if (initialPath) {
  bindNavigation();
  render(initialPath);
}
