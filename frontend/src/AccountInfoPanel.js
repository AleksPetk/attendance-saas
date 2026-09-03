import { createElement, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { ContentMarkdown, stripLeadingDocumentTitle } from "./contentMarkdown.js";
import { formatDate } from "./i18n/format.js";
import { workspaceDocsHomeUrl } from "./publicFooterLinks.js";

function InfoLoadingState({ label }) {
  return createElement(
    "div",
    { className: "loading-state", role: "status" },
    createElement("span", { className: "loading-spinner", "aria-hidden": true }),
    createElement("span", null, label),
  );
}

function InfoErrorBanner({ message }) {
  return createElement("div", { className: "alert alert-error", role: "alert" }, message);
}

export function selectedInfoDocumentSlug(searchParams) {
  return String(searchParams?.get("document") || "").trim();
}

export function updateInfoDocumentSearch(searchParams, slug) {
  const next = new URLSearchParams(searchParams);
  if (slug) next.set("document", slug);
  else next.delete("document");
  return next;
}

function formatContentDate(value, locale) {
  if (!value) return "";
  return formatDate(value, locale, { year: "numeric", month: "long", day: "numeric" }) || String(value);
}

export function groupContentDocuments(documents, fallbackGroupLabel = "Information") {
  const groups = new Map();
  for (const document of Array.isArray(documents) ? documents : []) {
    const id = document.nav_group || document.document_type || "information";
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: document.nav_group_label || fallbackGroupLabel,
        documents: [],
      });
    }
    groups.get(id).documents.push(document);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    documents: group.documents.slice().sort((left, right) => {
      const order = Number(left.sort_order || 0) - Number(right.sort_order || 0);
      return order || String(left.title || "").localeCompare(String(right.title || ""));
    }),
  }));
}

function infoNavigationClick(event, slug, onOpen) {
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
  onOpen(slug);
}

function documentMeta(document, locale, t) {
  const pieces = [];
  if (document.effective_on) {
    pieces.push(t("account:info.metaEffective", { date: formatContentDate(document.effective_on, locale) }));
  } else if (document.updated_at) {
    pieces.push(t("account:info.metaUpdated", { date: formatContentDate(document.updated_at, locale) }));
  }
  if (document.version) {
    pieces.push(t("account:info.metaVersion", { version: document.version }));
  }
  return pieces;
}

export function InfoDocumentList({ documents, onOpen, fallbackGroupLabel, locale = "en", t }) {
  const translate = t || ((key, options) => key);
  const groups = groupContentDocuments(documents, fallbackGroupLabel);
  if (!groups.length) {
    return createElement(
      "div",
      { className: "account-panel-empty" },
      createElement("p", null, translate("account:info.emptyList")),
    );
  }

  return createElement(
    "div",
    { className: "account-info-groups" },
    groups.map((group) =>
      createElement(
        "section",
        { className: "account-info-group", key: group.id },
        createElement("h2", null, group.label),
        createElement(
          "div",
          { className: "account-info-card-grid" },
          group.documents.map((document) => {
            const meta = documentMeta(document, locale, translate);
            return createElement(
              "a",
              {
                className: "account-info-card",
                href: `/account/info?document=${encodeURIComponent(document.slug)}`,
                key: document.slug,
                onClick: (event) => infoNavigationClick(event, document.slug, onOpen),
              },
              createElement(
                "span",
                { className: "account-info-card-heading" },
                createElement("strong", null, document.title),
                createElement("span", { "aria-hidden": true }, "→"),
              ),
              document.description
                ? createElement("span", { className: "account-info-card-description" }, document.description)
                : null,
              meta.length
                ? createElement(
                    "span",
                    { className: "account-info-card-meta" },
                    meta.map((item) => createElement("span", { key: item }, item)),
                  )
                : null,
            );
          }),
        ),
      ),
    ),
  );
}

function faqGroups(payload, answersLabel) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const categories = Array.isArray(payload?.categories) ? payload.categories : [];
  const known = new Set(categories.map((category) => category.id));
  const groups = categories
    .map((category) => ({
      id: category.id,
      label: category.label,
      entries: entries.filter((entry) => entry.category === category.id),
    }))
    .filter((group) => group.entries.length);
  const uncategorized = entries.filter((entry) => !known.has(entry.category));
  if (uncategorized.length) {
    groups.push({ id: "answers", label: answersLabel, entries: uncategorized });
  }
  return groups;
}

export function InfoFaqList({ payload, onDocumentNavigate, title, emptyLabel, answersLabel }) {
  const [openSlug, setOpenSlug] = useState("");
  const groups = faqGroups(payload, answersLabel);
  if (!groups.length) {
    return createElement("p", { className: "account-info-faq-empty" }, emptyLabel);
  }

  return createElement(
    "section",
    { className: "account-info-faq", "aria-label": title },
    createElement("h2", null, title),
    groups.map((group) =>
      createElement(
        "section",
        { className: "account-info-faq-group", key: group.id },
        createElement("h3", null, group.label),
        createElement(
          "div",
          { className: "account-info-faq-list" },
          group.entries.map((entry) => {
            const isOpen = openSlug === entry.slug;
            const panelId = `account-info-faq-${entry.slug}`;
            return createElement(
              "article",
              { className: isOpen ? "account-info-faq-item is-open" : "account-info-faq-item", key: entry.slug },
              createElement(
                "button",
                {
                  type: "button",
                  className: "account-info-faq-question",
                  "aria-expanded": isOpen,
                  "aria-controls": panelId,
                  onClick: () => setOpenSlug((current) => (current === entry.slug ? "" : entry.slug)),
                },
                createElement("span", null, entry.question),
                createElement("span", { className: "account-info-faq-chevron", "aria-hidden": true }, "⌄"),
              ),
              isOpen
                ? createElement(
                    "div",
                    { className: "account-info-faq-answer", id: panelId },
                    createElement(ContentMarkdown, {
                      markdown: entry.answer_markdown || "",
                      onDocumentNavigate,
                    }),
                  )
                : null,
            );
          }),
        ),
      ),
    ),
  );
}

export function InfoDocumentViewer({
  document,
  faqPayload,
  onBack,
  onDocumentNavigate,
  locale,
  labels,
}) {
  const meta = documentMeta(document, locale, (key, options) => labels.t(key, options));
  const body = stripLeadingDocumentTitle(document.body_markdown || "", document.title);
  return createElement(
    "article",
    { className: "account-info-viewer" },
    createElement(
      "button",
      { type: "button", className: "account-info-back", onClick: onBack },
      createElement("span", { "aria-hidden": true }, "←"),
      ` ${labels.backToInfo}`,
    ),
    createElement(
      "header",
      { className: "account-info-document-header" },
      createElement(
        "span",
        { className: "account-info-document-type" },
        document.nav_group_label || document.document_type || labels.fallbackGroup,
      ),
      createElement("h1", null, document.title),
      document.description ? createElement("p", null, document.description) : null,
      meta.length
        ? createElement(
            "div",
            { className: "account-info-document-meta" },
            meta.map((item) => createElement("span", { key: item }, item)),
          )
        : null,
    ),
    createElement(ContentMarkdown, { markdown: body, onDocumentNavigate }),
    document.slug === "faq"
      ? createElement(InfoFaqList, {
          payload: faqPayload,
          onDocumentNavigate,
          title: labels.faqTitle,
          emptyLabel: labels.faqEmpty,
          answersLabel: labels.faqAnswers,
        })
      : null,
  );
}

export function InfoLoadError({ message, onBack, onRetry, backLabel, retryLabel }) {
  return createElement(
    "div",
    { className: "account-info-error" },
    createElement(InfoErrorBanner, { message }),
    createElement(
      "div",
      { className: "account-panel-actions" },
      onBack
        ? createElement("button", { type: "button", className: "btn-secondary", onClick: onBack }, backLabel)
        : null,
      onRetry
        ? createElement("button", { type: "button", className: "btn-primary", onClick: onRetry }, retryLabel)
        : null,
    ),
  );
}

export default function AccountInfoPanel({ contentLang = "en" }) {
  const { t } = useTranslation(["account", "common"]);
  const resolvedLang = contentLang === "ja" ? "ja" : "en";
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlug = selectedInfoDocumentSlug(searchParams);
  const [documents, setDocuments] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [listReload, setListReload] = useState(0);
  const [document, setDocument] = useState(null);
  const [faqPayload, setFaqPayload] = useState(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [documentReload, setDocumentReload] = useState(0);

  const infoLabels = useMemo(
    () => ({
      t,
      backToInfo: t("account:info.backToInfo"),
      faqTitle: t("account:info.faqTitle"),
      faqEmpty: t("account:info.faqEmpty"),
      faqAnswers: t("account:info.faqAnswers"),
      fallbackGroup: t("account:info.fallbackGroup"),
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError("");
    api
      .listContentDocuments({ lang: resolvedLang })
      .then((result) => {
        if (!cancelled) setDocuments(result.data?.documents || []);
      })
      .catch((error) => {
        if (!cancelled) setListError(errorMessage(error) || t("account:info.listError"));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listReload, resolvedLang, t]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSlug) {
      setDocument(null);
      setFaqPayload(null);
      setDocumentError("");
      setDocumentLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setDocument(null);
    setFaqPayload(null);
    setDocumentError("");
    setDocumentLoading(true);
    const requests = [api.getContentDocument(selectedSlug, { lang: resolvedLang })];
    if (selectedSlug === "faq") requests.push(api.listContentFaq({ lang: resolvedLang }));
    Promise.all(requests)
      .then(([documentResult, faqResult]) => {
        if (cancelled) return;
        setDocument(documentResult.data);
        setFaqPayload(faqResult?.data || null);
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error?.status === 404
            ? t("account:info.documentUnavailable")
            : errorMessage(error) || t("account:info.documentLoadError");
        setDocumentError(message);
      })
      .finally(() => {
        if (!cancelled) setDocumentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug, documentReload, resolvedLang, t]);

  const updateSelectedDocument = useMemo(
    () => (slug) => {
      setSearchParams(updateInfoDocumentSearch(searchParams, slug));
    },
    [searchParams, setSearchParams],
  );

  if (selectedSlug) {
    if (documentLoading) {
      return createElement(
        "div",
        { className: "account-info-panel" },
        createElement(InfoLoadingState, { label: t("account:info.loadingDocument") }),
      );
    }
    if (documentError || !document) {
      return createElement(
        "div",
        { className: "account-info-panel" },
        createElement(InfoLoadError, {
          message: documentError || t("account:info.documentUnavailable"),
          onBack: () => updateSelectedDocument(""),
          onRetry: () => setDocumentReload((value) => value + 1),
          backLabel: t("account:info.backToInfo"),
          retryLabel: t("account:info.tryAgain"),
        }),
      );
    }
    return createElement(
      "div",
      { className: "account-info-panel account-info-panel-viewer" },
      createElement(InfoDocumentViewer, {
        document,
        faqPayload,
        locale: resolvedLang,
        labels: infoLabels,
        onBack: () => updateSelectedDocument(""),
        onDocumentNavigate: updateSelectedDocument,
      }),
    );
  }

  return createElement(
    "section",
    {
      className: "account-info-panel",
      "aria-label": t("account:info.panelAria"),
      "data-tutorial-target": "account-info",
    },
    createElement(
      "div",
      { className: "account-info-intro" },
      createElement("h1", null, t("account:info.title")),
      createElement("p", null, t("account:info.description")),
      createElement(
        "p",
        { className: "account-info-open-docs" },
        createElement(
          "a",
          {
            className: "btn-secondary btn-sm",
            href: workspaceDocsHomeUrl(resolvedLang),
            target: "_blank",
            rel: "noopener noreferrer",
          },
          t("account:info.openDocs"),
        ),
      ),
    ),
    listLoading ? createElement(InfoLoadingState, { label: t("account:info.loadingList") }) : null,
    listError
      ? createElement(InfoLoadError, {
          message: listError,
          onRetry: () => setListReload((value) => value + 1),
          retryLabel: t("account:info.tryAgain"),
        })
      : null,
    !listLoading && !listError
      ? createElement(InfoDocumentList, {
          documents,
          onOpen: updateSelectedDocument,
          fallbackGroupLabel: t("account:info.fallbackGroup"),
          locale: resolvedLang,
          t,
        })
      : null,
  );
}
