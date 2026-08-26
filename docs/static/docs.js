import { extractHeadings, escapeHtml, renderMarkdown } from "./markdown.js";
import { groupDocuments, hrefForDocument, slugFromPath } from "./docs-view.js";
import {
  faqPathForQuery,
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
  SUPPORT_POPULAR_CATEGORIES,
  contactHref,
  featuredQuestions,
  statusApiUrl,
  statusSummary,
  statusTone,
  supportPathForQuery,
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

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

async function fetchJson(path) {
  const response = await fetch(apiUrl(path), {
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error("document_fetch_failed");
  }
  return response.json();
}

function setMeta(documentData) {
  const title =
    documentData && documentData.slug !== "documentation"
      ? `${documentData.title} · CheckStation Docs`
      : "CheckStation Docs";
  window.document.title = title;
  const description =
    (documentData && documentData.description) ||
    "Public documentation and legal information for the Check Station platform.";
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
    `${String(config().publicUrl || "").replace(/\/+$/, "")}${hrefForDocument(documentData)}`;
  if (href) canonical.setAttribute("href", href);
}

function renderNav(documents, activeSlug) {
  const groups = groupDocuments(documents);
  const nav = window.document.getElementById("sidebar-nav");
  if (!groups.length) {
    nav.innerHTML = `<p class="docs-nav-loading">No published documents.</p>`;
    return;
  }
  nav.innerHTML = groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          const href = hrefForDocument(item);
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

function renderToc(source) {
  const headings = extractHeadings(source);
  if (headings.length < 4) return "";
  const items = headings
    .map(
      (item) =>
        `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a></li>`,
    )
    .join("");
  return `<nav class="docs-toc" aria-label="On this page"><h2>On this page</h2><ol>${items}</ol></nav>`;
}

function renderHomeIndex(documents) {
  const groups = groupDocuments(documents).filter((group) => group.id !== "home");
  if (!groups.length) return "";
  return `<div class="docs-home-index">${groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          const desc = item.description
            ? `<p>${escapeHtml(item.description)}</p>`
            : "";
          return `<a href="${escapeHtml(hrefForDocument(item))}">${escapeHtml(item.title)}</a>${desc}`;
        })
        .join("");
      return `<section class="docs-home-card"><h2>${escapeHtml(group.label)}</h2>${items}</section>`;
    })
    .join("")}</div>`;
}

function renderMeta(documentData) {
  const bits = [];
  if (documentData.version) bits.push(`Version ${escapeHtml(documentData.version)}`);
  if (documentData.effective_on) {
    bits.push(`Effective ${escapeHtml(formatDate(documentData.effective_on))}`);
  }
  if (documentData.updated_at) {
    bits.push(`Updated ${escapeHtml(formatDate(documentData.updated_at))}`);
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

function renderArticle(documentData, documents) {
  const title = documentData.title || "";
  const stripped = stripTitle(documentData.body_markdown || "", title);
  const body = renderMarkdown(stripped);
  const toc = documentData.slug === "documentation" ? "" : renderToc(stripped);
  const index =
    documentData.slug === "documentation" ? renderHomeIndex(documents) : "";
  const lede = documentData.description
    ? `<p class="docs-lede">${escapeHtml(documentData.description)}</p>`
    : "";
  return `${renderMeta(documentData)}
    <h1>${escapeHtml(documentData.title)}</h1>
    ${lede}
    ${toc}
    <article class="docs-prose">${body}</article>
    ${index}`;
}

function faqItemHtml(entry, { expanded, documents, query, instanceId }) {
  const slug = escapeHtml(entry.slug);
  const uid = escapeHtml(instanceId || entry.slug);
  const hidden = expanded ? "" : " hidden";
  const expandedAttr = expanded ? "true" : "false";
  const openClass = expanded ? " is-open" : "";
  const questionHtml = highlightEscapedText(
    escapeHtml(entry.question),
    tokenizeQuery(query),
  );
  const related = relatedGuideMeta(entry.related_document_slug, documents);
  const relatedHtml = related
    ? `<p class="faq-related"><a class="faq-related-link" href="${escapeHtml(related.href)}">Related guide <span aria-hidden="true">→</span> ${escapeHtml(related.label)}</a></p>`
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

function renderFaqList(entries, { expandSingle, documents, query, instancePrefix }) {
  const expandAll = Boolean(expandSingle) && entries.length === 1;
  return entries
    .map((entry, index) =>
      faqItemHtml(entry, {
        expanded: expandAll,
        documents,
        query,
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

function renderFaqPage(documentData, faqPayload, query, documents) {
  const title = documentData.title || "FAQ";
  const stripped = stripTitle(documentData.body_markdown || "", title);
  const intro = renderMarkdown(stripped);
  const categories = (faqPayload && faqPayload.categories) || [];
  const allEntries = (faqPayload && faqPayload.entries) || [];
  const filtered = filterFaqEntries(allEntries, query);
  const value = escapeHtml(query);
  const chips = renderFaqChips(categories, "");
  const listOptions = { documents, query };
  let body = "";
  if (filtered.mode === "search") {
    if (!filtered.items.length) {
      body = `<div class="faq-empty" role="status">
        <p><strong>No matching answers found.</strong></p>
        <p>Try fewer words, or browse categories. You can also open <a href="/support">Support</a>.</p>
      </div>`;
    } else {
      body = `<p class="faq-count">${faqCountLabel(filtered.items.length)}</p>
        <div class="faq-results">${renderFaqList(filtered.items, { ...listOptions, expandSingle: true, instancePrefix: "search" })}</div>`;
    }
  } else {
    const featured = allEntries.filter((entry) => entry.featured);
    const groups = groupFaqByCategory(allEntries, categories);
    const popular = featured.length
      ? `<section class="faq-group" id="faq-popular">
          <h2>Popular questions</h2>
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
  return `${renderMeta(documentData)}
    <h1>FAQ</h1>
    <p class="docs-lede">Find answers about CheckStation.</p>
    <article class="docs-prose faq-intro">${intro}</article>
    <div class="faq-toolbar">
    <form class="faq-search" role="search" action="/faq" method="get">
      <label class="faq-search-label" for="faq-search">Search CheckStation help</label>
      <div class="faq-search-row">
        <input
          id="faq-search"
          name="q"
          type="search"
          value="${value}"
          placeholder="Search CheckStation help..."
          autocomplete="off"
          enterkeyhint="search"
        />
        <button type="button" class="faq-search-clear" id="faq-search-clear"${clearHidden}>Clear</button>
      </div>
    </form>
    <nav class="faq-chips" aria-label="FAQ categories">${chips}</nav>
    </div>
    <div class="faq-body">${body}</div>`;
}

function bindFaqSearch() {
  bindHelpSearch({
    inputId: "faq-search",
    clearId: "faq-search-clear",
    basePath: "/faq",
    pathForQuery: faqPathForQuery,
    refresh: refreshFaqResults,
  });
}

function bindSupportSearch() {
  bindHelpSearch({
    inputId: "support-search",
    clearId: "support-search-clear",
    basePath: "/support",
    pathForQuery: supportPathForQuery,
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

function refreshFaqResults(query) {
  const body = window.document.querySelector(".faq-body");
  const clear = window.document.getElementById("faq-search-clear");
  if (!body || !faqCache) return;
  const filtered = filterFaqEntries(faqCache.entries || [], query);
  const listOptions = { documents: faqDocuments, query };
  if (clear) clear.hidden = !String(query || "").trim();
  if (filtered.mode === "search") {
    syncFaqChipActive("");
    if (!filtered.items.length) {
      body.innerHTML = `<div class="faq-empty" role="status">
        <p><strong>No matching answers found.</strong></p>
        <p>Try fewer words, or browse categories. You can also open <a href="/support">Support</a>.</p>
      </div>`;
      return;
    }
    body.innerHTML = `<p class="faq-count">${faqCountLabel(filtered.items.length)}</p>
      <div class="faq-results">${renderFaqList(filtered.items, { ...listOptions, expandSingle: true, instancePrefix: "search" })}</div>`;
    return;
  }
  const featured = (faqCache.entries || []).filter((entry) => entry.featured);
  const groups = groupFaqByCategory(faqCache.entries || [], faqCache.categories || []);
  const popular = featured.length
    ? `<section class="faq-group" id="faq-popular">
        <h2>Popular questions</h2>
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

async function fetchStatusSummary() {
  const url = statusApiUrl(config().statusPublicUrl);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return statusSummary(null);
    return statusSummary(await response.json());
  } catch {
    return statusSummary(null);
  }
}

function renderSupportBody(faqPayload, query, documents) {
  const allEntries = (faqPayload && faqPayload.entries) || [];
  const filtered = filterFaqEntries(allEntries, query);
  const listOptions = { documents, query };
  if (filtered.mode === "search") {
    if (!filtered.items.length) {
      return `<div class="faq-empty" role="status">
        <p><strong>No matching answers found.</strong></p>
        <p>Try fewer words, or browse popular categories below.</p>
      </div>`;
    }
    return `<p class="faq-count">${faqCountLabel(filtered.items.length)}</p>
      <div class="faq-results">${renderFaqList(filtered.items, { ...listOptions, expandSingle: true, instancePrefix: "support-search" })}</div>`;
  }
  const featured = featuredQuestions(allEntries, 6);
  if (!featured.length) {
    return `<p class="faq-empty" role="status">Help articles are not available right now.</p>`;
  }
  return `<section class="faq-group" id="support-common">
      <h2>Common questions</h2>
      ${renderFaqList(featured, { ...listOptions, expandSingle: false, instancePrefix: "support-common" })}
    </section>`;
}

function renderSupportPage(documentData, faqPayload, query, documents, status) {
  const title = documentData.title || "Support";
  const stripped = stripTitle(documentData.body_markdown || "", title);
  const intro = renderMarkdown(stripped);
  const value = escapeHtml(query);
  const clearHidden = query.trim() ? "" : " hidden";
  const categories = SUPPORT_POPULAR_CATEGORIES.map(
    (category) =>
      `<a class="faq-chip" href="/faq#faq-cat-${escapeHtml(category.id)}">${escapeHtml(category.label)}</a>`,
  ).join("");
  const tone = statusTone(status.state);
  const contactUrl = escapeHtml(contactHref(config().mainSiteUrl));
  return `${renderMeta(documentData)}
    <h1>CheckStation Support</h1>
    <p class="docs-lede">How can we help?</p>
    <article class="docs-prose faq-intro">${intro}</article>
    <div class="faq-toolbar">
    <form class="faq-search" role="search" action="/support" method="get">
      <label class="faq-search-label" for="support-search">Search CheckStation help</label>
      <div class="faq-search-row">
        <input
          id="support-search"
          name="q"
          type="search"
          value="${value}"
          placeholder="Search CheckStation help..."
          autocomplete="off"
          enterkeyhint="search"
        />
        <button type="button" class="faq-search-clear" id="support-search-clear"${clearHidden}>Clear</button>
      </div>
    </form>
    <p class="support-categories-label">Popular categories</p>
    <nav class="faq-chips" aria-label="Popular help categories">${categories}</nav>
    </div>
    <div class="faq-body">${renderSupportBody(faqPayload, query, documents)}</div>
    <section class="support-status" aria-live="polite">
      <h2>System Status</h2>
      <p class="support-status-line">
        <span class="support-status-dot ${escapeHtml(tone)}" aria-hidden="true"></span>
        <span>${escapeHtml(status.label)}</span>
      </p>
    </section>
    <section class="support-contact">
      <h2>Still need help?</h2>
      <p>If the answers above do not solve it, send a message from the CheckStation Contact page.</p>
      <a class="support-contact-btn" href="${contactUrl}">Contact CheckStation</a>
    </section>`;
}

function refreshSupportResults(query) {
  const body = window.document.querySelector(".faq-body");
  const clear = window.document.getElementById("support-search-clear");
  if (!body || !faqCache) return;
  if (clear) clear.hidden = !String(query || "").trim();
  body.innerHTML = renderSupportBody(faqCache, query, faqDocuments);
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

async function render(path) {
  const main = window.document.getElementById("docs-main");
  const slug = slugFromPath(path);
  try {
    const requests = [
      fetchJson("/api/content/documents/"),
      fetchJson(`/api/content/documents/${encodeURIComponent(slug)}/`),
    ];
    if (slug === "faq" || slug === "support") {
      requests.push(fetchJson("/api/content/faq/"));
    }
    const [listPayload, documentData, faqPayload] = await Promise.all(requests);
    const documents = (listPayload && listPayload.documents) || [];
    renderNav(documents, slug);
    if (!documentData) {
      setMeta({ title: "Not found", description: "This document is not published.", slug: "not-found" });
      main.innerHTML = `<article class="docs-article"><h1>Document not available</h1><p class="docs-error">This page is not published.</p></article>`;
      return;
    }
    setMeta(documentData);
    if (slug === "faq") {
      faqCache = faqPayload || { categories: [], entries: [] };
      faqDocuments = documents;
      const query = searchQueryFromSearch(window.location.search);
      main.innerHTML = `<div class="docs-article docs-article-faq">${renderFaqPage(documentData, faqCache, query, documents)}</div>`;
      bindFaqSearch();
      return;
    }
    if (slug === "support") {
      faqCache = faqPayload || { categories: [], entries: [] };
      faqDocuments = documents;
      const query = searchQueryFromSearch(window.location.search);
      const status = await fetchStatusSummary();
      main.innerHTML = `<div class="docs-article docs-article-support">${renderSupportPage(documentData, faqCache, query, documents, status)}</div>`;
      bindSupportSearch();
      return;
    }
    faqCache = null;
    faqDocuments = [];
    main.innerHTML = `<div class="docs-article">${renderArticle(documentData, documents)}</div>`;
  } catch (error) {
    setMeta({ title: "Docs unavailable", slug: "error" });
    main.innerHTML = `<article class="docs-article"><h1>Documentation unavailable</h1><p class="docs-error">The documentation service could not load canonical content. Try again shortly.</p></article>`;
  }
}

function bindNavigation() {
  const main = window.document.getElementById("docs-main");
  bindFaqAccordion(main);
  window.document.addEventListener("click", (event) => {
    const chip = event.target.closest(".faq-chip");
    if (chip && chip.getAttribute("href")?.startsWith("#faq-cat-")) {
      const input = window.document.getElementById("faq-search");
      if (input && input.value.trim()) {
        input.value = "";
        window.history.replaceState({}, "", "/faq");
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
}

bindNavigation();
render(currentPath());
