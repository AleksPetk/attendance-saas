import { useEffect, useState } from "react";
import { HelpMarkdown } from "./HelpMarkdown";
import { Button } from "./ui";
import { useApp } from "../lib/AppProvider";
import { getDocument, type Document } from "../lib/help";
import { legalSlugFromHref } from "../lib/legalDocuments";
import { formatDateTime } from "@checkstation/i18n";

function formatLegalDate(value: string | null | undefined, locale: "en" | "ja"): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function stripLeadingDocumentTitle(markdown: string, title: string): string {
  const body = String(markdown || "").replace(/^\uFEFF/, "");
  const heading = String(title || "").trim();
  if (!heading) return body;
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.replace(new RegExp(`^\\s*#\\s+${escaped}\\s*(?:\\r?\\n)+`, "i"), "");
}

/**
 * In-app legal document viewer for Create Account.
 * Fetches live content from GET /content/documents/{slug}/ — same source as Browser + Mobile.
 */
export function DesktopLegalDocumentModal({
  slug,
  onClose,
  onOpenSlug,
}: {
  slug: string | null;
  onClose: () => void;
  onOpenSlug: (slug: string) => void;
}) {
  const { api, locale, t } = useApp();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    setDocument(null);
    void getDocument(api, slug, locale)
      .then((result) => {
        if (!cancelled) setDocument(result);
      })
      .catch(() => {
        if (!cancelled) setError(t("auth.documentLoadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, locale, reload, slug, t]);

  useEffect(() => {
    if (!slug) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, slug]);

  if (!slug) return null;

  const title =
    document?.title ||
    (slug === "privacy-policy" ? t("auth.privacy") : t("auth.terms"));
  const metaDate = document?.effective_on
    ? t("auth.registrationLegal.effective", { date: formatLegalDate(document.effective_on, locale) })
    : document?.updated_at
      ? t("auth.registrationLegal.updated", {
          date: formatLegalDate(document.updated_at, locale) || formatDateTime(document.updated_at, locale),
        })
      : "";
  const body = document ? stripLeadingDocumentTitle(document.body_markdown || "", document.title) : "";

  return (
    <div
      className="registration-legal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="registration-legal-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-legal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="registration-legal-toolbar">
          <div>
            <span className="registration-legal-eyebrow">{t("auth.registrationLegal.eyebrow")}</span>
            <h2 id="registration-legal-title">{title || t("auth.registrationLegal.fallbackTitle")}</h2>
          </div>
          <button
            type="button"
            className="registration-legal-close"
            onClick={onClose}
            aria-label={t("auth.registrationLegal.close")}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="registration-legal-scroll">
          {loading ? (
            <div className="registration-legal-status" role="status">
              {t("auth.registrationLegal.loading")}
            </div>
          ) : null}
          {!loading && error ? (
            <div className="registration-legal-status" role="alert">
              <p>{error}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReload((value) => value + 1)}
              >
                {t("auth.registrationLegal.tryAgain")}
              </Button>
            </div>
          ) : null}
          {!loading && !error && document ? (
            <article className="registration-legal-document">
              {document.description ? (
                <p className="registration-legal-description">{document.description}</p>
              ) : null}
              {metaDate ? <p className="registration-legal-date">{metaDate}</p> : null}
              <HelpMarkdown
                markdown={body}
                onDocument={(next) => {
                  const fromHref = legalSlugFromHref(next) || legalSlugFromHref(`/${next}`);
                  onOpenSlug(fromHref || next);
                }}
              />
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
