import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ContentMarkdown, stripLeadingDocumentTitle } from "./contentMarkdown.js";

function formatLegalDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function RegistrationLegalViewer({
  document,
  loading,
  error,
  onClose,
  onRetry,
  onDocumentNavigate,
}) {
  const { t } = useTranslation("auth");

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const date = document?.effective_on
    ? t("registrationLegal.effective", { date: formatLegalDate(document.effective_on) })
    : document?.updated_at
      ? t("registrationLegal.updated", { date: formatLegalDate(document.updated_at) })
      : "";
  const body = document
    ? stripLeadingDocumentTitle(document.body_markdown || "", document.title)
    : "";

  return (
    <div className="registration-legal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="registration-legal-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-legal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="registration-legal-toolbar">
          <div>
            <span className="registration-legal-eyebrow">{t("registrationLegal.eyebrow")}</span>
            <h2 id="registration-legal-title">{document?.title || t("registrationLegal.fallbackTitle")}</h2>
          </div>
          <button
            type="button"
            className="registration-legal-close"
            onClick={onClose}
            aria-label={t("registrationLegal.close")}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="registration-legal-scroll">
          {loading ? (
            <div className="registration-legal-status" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <span>{t("registrationLegal.loading")}</span>
            </div>
          ) : null}
          {!loading && error ? (
            <div className="registration-legal-status" role="alert">
              <p>{error}</p>
              <button type="button" className="btn-secondary" onClick={onRetry}>
                {t("registrationLegal.tryAgain")}
              </button>
            </div>
          ) : null}
          {!loading && !error && document ? (
            <article className="registration-legal-document">
              {document.description ? <p className="registration-legal-description">{document.description}</p> : null}
              {date ? <p className="registration-legal-date">{date}</p> : null}
              <ContentMarkdown
                markdown={body}
                onDocumentNavigate={onDocumentNavigate}
                internalDocumentHref={(slug) => `/register?legal=${encodeURIComponent(slug)}`}
                className="registration-legal-markdown"
              />
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
