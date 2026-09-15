import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { contactCatalogLabel } from "./contactCatalogLabels.js";
import {
  HONEYPOT_FIELD,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUBJECT_MAX,
  SUBJECT_MIN,
  suggestedSubject,
} from "./contactForm.js";
import { ContentMarkdown } from "./contentMarkdown.js";
import { publicDocsDocumentUrl } from "./publicFooterLinks.js";

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p className="account-contact-field-error" id={id} role="alert">
      {message}
    </p>
  );
}

function catalogLabel(locale, id, fallback) {
  return contactCatalogLabel(locale, id, fallback);
}

export default function AccountContactPanel({
  account = null,
  contentLang = "en",
}) {
  const { t } = useTranslation(["account", "common"]);
  const locale = contentLang === "ja" ? "ja" : "en";
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [openSlug, setOpenSlug] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const email = String(account?.email || "").trim();

  const category = useMemo(
    () => (categories || []).find((item) => item.id === categoryId) || null,
    [categories, categoryId],
  );
  const subcategory = useMemo(
    () =>
      (category?.subcategories || []).find((item) => item.id === subcategoryId) ||
      null,
    [category, subcategoryId],
  );
  const classified = Boolean(category && subcategory);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);
    api
      .getContactCategories()
      .then((result) => {
        if (!cancelled) setCategories(result.data?.categories || []);
      })
      .catch(() => {
        if (!cancelled) setFormError(t("account:contactPanel.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!categoryId || !subcategoryId) {
      setSuggestions([]);
      setOpenSlug("");
      return undefined;
    }
    let cancelled = false;
    api
      .getContactSuggestions(categoryId, subcategoryId, { lang: locale })
      .then((result) => {
        if (!cancelled) setSuggestions(result.data?.items || []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, subcategoryId, locale]);

  useEffect(() => {
    if (!subjectTouched && category && subcategory) {
      setSubject(
        suggestedSubject(
          catalogLabel(locale, category.id, category.label),
          catalogLabel(locale, subcategory.id, subcategory.label),
        ),
      );
    }
  }, [category, subcategory, subjectTouched, locale]);

  function resetForm() {
    setCategoryId("");
    setSubcategoryId("");
    setSuggestions([]);
    setOpenSlug("");
    setName("");
    setSubject("");
    setSubjectTouched(false);
    setMessage("");
    setHoneypot("");
    setErrors({});
    setFormError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setFormError("");
    setErrors({});
    try {
      const result = await api.submitWorkspaceContact({
        category: categoryId,
        subcategory: subcategoryId,
        name,
        subject,
        message,
        page_path: "/account/contact",
        locale,
        [HONEYPOT_FIELD]: honeypot,
      });
      setSuccess({
        reference: result.data.reference,
        message: result.data.message,
        delivered: result.data.delivered,
      });
      resetForm();
    } catch (err) {
      if (err?.status === 429) {
        setFormError(t("account:contactPanel.rateLimited"));
      } else if (err?.data && typeof err.data === "object") {
        const next = {};
        for (const [key, value] of Object.entries(err.data)) {
          if (key === "detail") {
            setFormError(Array.isArray(value) ? value[0] : String(value));
          } else {
            next[key] = Array.isArray(value) ? value[0] : String(value);
          }
        }
        setErrors(next);
        if (!err.data.detail) setFormError(errorMessage(err));
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  const faqBase = publicDocsDocumentUrl("faq", locale);

  return (
    <section
      className="account-info-panel account-contact-panel"
      aria-labelledby="account-contact-title"
      data-tutorial-target="account-contact"
    >
      <header className="account-info-intro account-contact-intro">
        <p className="account-info-eyebrow">{t("account:contactPanel.eyebrow")}</p>
        <h2 id="account-contact-title">{t("account:contactPanel.title")}</h2>
        <p>{t("account:contactPanel.description")}</p>
      </header>

      {success ? (
        <div className="account-contact-success" role="status">
          <div className="account-contact-success-copy">
            <strong>
              {success.delivered === false
                ? t("account:contactPanel.successSaved")
                : t("account:contactPanel.successSent")}
            </strong>
            <p>{success.message || t("account:contactPanel.successDefault")}</p>
            {success.reference ? (
              <p className="hint">
                {t("account:contactPanel.reference", { reference: success.reference })}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setSuccess(null)}
          >
            {t("account:contactPanel.sendAnother")}
          </button>
        </div>
      ) : null}

      {formError ? (
        <div className="alert alert-error" role="alert">
          {formError}
        </div>
      ) : null}

      <form className="account-contact-form" onSubmit={handleSubmit} noValidate>
        <div className="account-settings-section is-static tone-password account-contact-card">
          <div className="account-settings-header">
            <div className="account-settings-trigger-main">
              <h3 className="account-settings-title">
                {t("account:contactPanel.topicTitle")}
              </h3>
              <p className="account-settings-description">
                {t("account:contactPanel.topicLead")}
              </p>
            </div>
          </div>
          <div className="account-settings-panel">
            {loadingCatalog ? (
              <p className="hint">{t("common:loading")}</p>
            ) : (
              <div className="account-contact-topic-grid">
                <div className="account-contact-field">
                  <label htmlFor="account-contact-category">
                    {t("account:contactPanel.categoryLabel")}
                  </label>
                  <select
                    id="account-contact-category"
                    value={categoryId}
                    onChange={(event) => {
                      setCategoryId(event.target.value);
                      setSubcategoryId("");
                      setSubjectTouched(false);
                    }}
                    aria-invalid={errors.category ? "true" : "false"}
                  >
                    <option value="">
                      {t("account:contactPanel.categoryPlaceholder")}
                    </option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {catalogLabel(locale, item.id, item.label)}
                      </option>
                    ))}
                  </select>
                  <FieldError id="account-contact-category-error" message={errors.category} />
                </div>
                <div className="account-contact-field">
                  <label htmlFor="account-contact-subcategory">
                    {t("account:contactPanel.subcategoryLabel")}
                  </label>
                  <select
                    id="account-contact-subcategory"
                    value={subcategoryId}
                    disabled={!category}
                    onChange={(event) => {
                      setSubcategoryId(event.target.value);
                      setSubjectTouched(false);
                    }}
                    aria-invalid={errors.subcategory ? "true" : "false"}
                  >
                    <option value="">
                      {category
                        ? t("account:contactPanel.subcategoryPlaceholder")
                        : t("account:contactPanel.chooseCategoryFirst")}
                    </option>
                    {(category?.subcategories || []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {catalogLabel(locale, item.id, item.label)}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="account-contact-subcategory-error"
                    message={errors.subcategory}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {classified ? (
          <div className="account-settings-section is-static tone-email account-contact-card">
            <div className="account-settings-header">
              <div className="account-settings-trigger-main">
                <h3 className="account-settings-title">
                  {t("account:contactPanel.helpTitle")}
                </h3>
                <p className="account-settings-description">
                  {t("account:contactPanel.helpLead")}
                </p>
              </div>
            </div>
            <div className="account-settings-panel">
              {suggestions.length ? (
                <ul className="account-contact-help-list">
                  {suggestions.map((item) => {
                    const open = openSlug === item.slug;
                    return (
                      <li key={item.slug} className={open ? "is-open" : ""}>
                        <button
                          type="button"
                          className="account-contact-help-question"
                          aria-expanded={open}
                          onClick={() =>
                            setOpenSlug((current) =>
                              current === item.slug ? "" : item.slug,
                            )
                          }
                        >
                          <span>{item.question}</span>
                          <span className="account-contact-help-chevron" aria-hidden="true">
                            ▾
                          </span>
                        </button>
                        {open ? (
                          <div className="account-contact-help-answer">
                            <div className="account-contact-help-body">
                              <ContentMarkdown markdown={item.answer_markdown || ""} />
                            </div>
                            {faqBase ? (
                              <a
                                className="account-contact-help-docs"
                                href={`${faqBase}?q=${encodeURIComponent(item.question || "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t("account:contactPanel.openInFaq")}
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="hint">{t("account:contactPanel.helpEmpty")}</p>
              )}
            </div>
          </div>
        ) : null}

        {classified ? (
          <div className="account-settings-section is-static tone-password account-contact-card">
            <div className="account-settings-header">
              <div className="account-settings-trigger-main">
                <h3 className="account-settings-title">
                  {t("account:contactPanel.messageTitle")}
                </h3>
                <p className="account-settings-description">
                  {t("account:contactPanel.messageLead")}
                </p>
              </div>
            </div>
            <div className="account-settings-panel account-contact-message-fields">
              <div className="account-contact-identity-grid">
                <div className="account-contact-field">
                  <label htmlFor="account-contact-email">
                    {t("account:contactPanel.emailLabel")}
                  </label>
                  <input
                    id="account-contact-email"
                    type="email"
                    value={email}
                    readOnly
                    autoComplete="email"
                  />
                </div>
                <div className="account-contact-field">
                  <label htmlFor="account-contact-name">
                    {t("account:contactPanel.nameLabel")}
                  </label>
                  <input
                    id="account-contact-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    autoComplete="name"
                  />
                </div>
              </div>
              <div className="account-contact-field">
                <label htmlFor="account-contact-subject">
                  {t("account:contactPanel.subjectLabel")}
                </label>
                <input
                  id="account-contact-subject"
                  type="text"
                  value={subject}
                  onChange={(event) => {
                    setSubjectTouched(true);
                    setSubject(event.target.value);
                  }}
                  minLength={SUBJECT_MIN}
                  maxLength={SUBJECT_MAX}
                  aria-invalid={errors.subject ? "true" : "false"}
                />
                <FieldError id="account-contact-subject-error" message={errors.subject} />
              </div>
              <div className="account-contact-field">
                <label htmlFor="account-contact-message">
                  {t("account:contactPanel.messageLabel")}
                </label>
                <textarea
                  id="account-contact-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  minLength={MESSAGE_MIN}
                  maxLength={MESSAGE_MAX}
                  rows={5}
                  aria-invalid={errors.message ? "true" : "false"}
                />
                <FieldError id="account-contact-message-error" message={errors.message} />
              </div>
              <div className="account-contact-honeypot" aria-hidden="true">
                <label htmlFor="account-contact-company">
                  {t("account:contactPanel.honeypotLabel")}
                </label>
                <input
                  id="account-contact-company"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </div>
              <div className="account-contact-actions">
                <button type="submit" className="btn-primary" disabled={loading || !email}>
                  {loading
                    ? t("account:contactPanel.submitting")
                    : t("account:contactPanel.submit")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}
