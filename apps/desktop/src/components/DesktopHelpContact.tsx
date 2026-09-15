import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { createAppConfig } from "@checkstation/config";
import {
  HONEYPOT_FIELD,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUBJECT_MAX,
  SUBJECT_MIN,
  publicFaqUrl,
  suggestedSubject,
} from "@checkstation/domain";
import { Alert, Button, Card, Field, Input, Loading, formatError } from "./ui";
import { contactCatalogLabel } from "../lib/contactCatalogLabels";
import {
  getContactCategories,
  getContactSuggestions,
  submitWorkspaceContact,
  type ContactCategory,
  type ContactSuggestion,
  type WorkspaceContactResult,
} from "../lib/helpContact";
import { useApp } from "../lib/AppProvider";
import { HelpMarkdown } from "./HelpMarkdown";

type SuccessState = Pick<WorkspaceContactResult, "reference" | "message" | "delivered">;

export function DesktopHelpContact({ emailHint = "" }: { emailHint?: string }) {
  const { api, locale, t } = useApp();
  const [categories, setCategories] = useState<ContactCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [openSlug, setOpenSlug] = useState("");
  const [email, setEmail] = useState(String(emailHint || "").trim());
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [catalogRetry, setCatalogRetry] = useState(0);

  const faqBase = useMemo(() => {
    const docsBase = createAppConfig({
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "https://workspace.checkstation.app/api",
    }).docsBaseUrl;
    return publicFaqUrl(docsBase);
  }, []);

  const category = useMemo(
    () => categories.find((item) => item.id === categoryId) || null,
    [categories, categoryId],
  );
  const subcategory = useMemo(
    () => (category?.subcategories || []).find((item) => item.id === subcategoryId) || null,
    [category, subcategoryId],
  );
  const classified = Boolean(category && subcategory);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);
    setFormError("");
    void getContactCategories(api)
      .then((result) => {
        if (!cancelled) setCategories(result.categories || []);
      })
      .catch((caught) => {
        if (!cancelled) {
          setCategories([]);
          setFormError(formatError(caught, t("help.contact.loadError")));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, catalogRetry, t]);

  useEffect(() => {
    const hint = String(emailHint || "").trim();
    if (hint) {
      setEmail(hint);
      return;
    }
    let cancelled = false;
    void api
      .get<{ email?: string }>(endpoints.account())
      .then((account) => {
        if (!cancelled) setEmail(String(account?.email || "").trim());
      })
      .catch(() => {
        /* identity hint from shell is enough when account is unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, [api, emailHint]);

  useEffect(() => {
    if (!categoryId || !subcategoryId) {
      setSuggestions([]);
      setOpenSlug("");
      setSuggestionsError("");
      setLoadingSuggestions(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingSuggestions(true);
    setSuggestionsError("");
    void getContactSuggestions(api, categoryId, subcategoryId, locale)
      .then((result) => {
        if (!cancelled) setSuggestions(result.items || []);
      })
      .catch((caught) => {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionsError(formatError(caught, t("help.contact.suggestionsError")));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, categoryId, subcategoryId, locale, t]);

  useEffect(() => {
    if (!subjectTouched && category && subcategory) {
      setSubject(
        suggestedSubject(
          contactCatalogLabel(locale, category.id, category.label),
          contactCatalogLabel(locale, subcategory.id, subcategory.label),
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
    setSuggestionsError("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setFormError("");
    setErrors({});
    try {
      const result = await submitWorkspaceContact(api, {
        category: categoryId,
        subcategory: subcategoryId,
        name,
        subject,
        message,
        page_path: "/help/contact",
        locale,
        [HONEYPOT_FIELD]: honeypot,
      });
      setSuccess({
        reference: result.reference,
        message: result.message,
        delivered: result.delivered,
      });
      resetForm();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 429) {
          setFormError(t("help.contact.rateLimited"));
        } else {
          const next = fieldErrorsFromBody(caught.data);
          setErrors(next);
          const detail = caught.data?.detail;
          if (typeof detail === "string" && detail.trim()) setFormError(detail);
          else if (Array.isArray(detail) && detail.length) setFormError(String(detail[0]));
          else if (!Object.keys(next).length) setFormError(formatError(caught, t("common.error")));
          else setFormError(formatError(caught, t("common.error")));
        }
      } else {
        setFormError(formatError(caught, t("common.error")));
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Card className="help-contact-success-card">
        <div className="help-contact-success" role="status">
          <div>
            <strong>
              {success.delivered === false
                ? t("help.contact.successSaved")
                : t("help.contact.successSent")}
            </strong>
            <p>{success.message || t("help.contact.successDefault")}</p>
            {success.reference ? (
              <p className="muted-copy">{t("help.contact.reference", { reference: success.reference })}</p>
            ) : null}
          </div>
          <Button variant="secondary" onClick={() => setSuccess(null)}>
            {t("help.contact.sendAnother")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="help-contact">
      <Card title={t("help.contact.topicTitle")} description={t("help.contact.topicLead")}>
        {loadingCatalog ? (
          <Loading label={t("common.loading")} />
        ) : formError && !categories.length ? (
          <div className="help-contact-error-block">
            <Alert>{formError}</Alert>
            <Button variant="secondary" onClick={() => setCatalogRetry((n) => n + 1)}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <div className="help-contact-topic-grid">
            <Field label={t("help.contact.categoryLabel")} error={errors.category}>
              <select
                className="input"
                data-testid="help-contact-category"
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setSubcategoryId("");
                  setSubjectTouched(false);
                }}
              >
                <option value="">{t("help.contact.categoryPlaceholder")}</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {contactCatalogLabel(locale, item.id, item.label)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("help.contact.subcategoryLabel")} error={errors.subcategory}>
              <select
                className="input"
                data-testid="help-contact-subcategory"
                value={subcategoryId}
                disabled={!category}
                onChange={(event) => {
                  setSubcategoryId(event.target.value);
                  setSubjectTouched(false);
                }}
              >
                <option value="">
                  {category
                    ? t("help.contact.subcategoryPlaceholder")
                    : t("help.contact.chooseCategoryFirst")}
                </option>
                {(category?.subcategories || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {contactCatalogLabel(locale, item.id, item.label)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Card>

      {classified ? (
        <Card title={t("help.contact.helpTitle")} description={t("help.contact.helpLead")}>
          {loadingSuggestions ? (
            <Loading label={t("common.loading")} />
          ) : suggestionsError ? (
            <Alert>{suggestionsError}</Alert>
          ) : suggestions.length ? (
            <ul className="help-contact-help-list" data-testid="help-contact-suggestions">
              {suggestions.map((item) => {
                const open = openSlug === item.slug;
                return (
                  <li key={item.slug} className={open ? "is-open" : ""}>
                    <button
                      type="button"
                      className="help-contact-help-question"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenSlug((current) => (current === item.slug ? "" : item.slug))
                      }
                    >
                      <span>{item.question}</span>
                      <span aria-hidden="true">{open ? "−" : "+"}</span>
                    </button>
                    {open ? (
                      <div className="help-contact-help-answer">
                        <HelpMarkdown markdown={item.answer_markdown || ""} />
                        {faqBase ? (
                          <a
                            className="help-contact-help-docs"
                            href={`${faqBase}?q=${encodeURIComponent(item.question || "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("help.contact.openInFaq")}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted-copy">{t("help.contact.helpEmpty")}</p>
          )}
        </Card>
      ) : null}

      {classified ? (
        <Card title={t("help.contact.messageTitle")} description={t("help.contact.messageLead")}>
          {formError ? <Alert>{formError}</Alert> : null}
          <form className="help-contact-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="help-contact-identity-grid">
              <Field label={t("help.contact.emailLabel")}>
                <Input
                  type="email"
                  value={email}
                  readOnly
                  autoComplete="email"
                  data-testid="help-contact-email"
                />
              </Field>
              <Field label={t("help.contact.nameLabel")}>
                <Input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoComplete="name"
                />
              </Field>
            </div>
            <Field label={t("help.contact.subjectLabel")} error={errors.subject}>
              <Input
                type="text"
                value={subject}
                onChange={(event) => {
                  setSubjectTouched(true);
                  setSubject(event.target.value);
                }}
                minLength={SUBJECT_MIN}
                maxLength={SUBJECT_MAX}
                data-testid="help-contact-subject"
              />
            </Field>
            <Field label={t("help.contact.messageLabel")} error={errors.message}>
              <textarea
                className="input"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                minLength={MESSAGE_MIN}
                maxLength={MESSAGE_MAX}
                rows={5}
                data-testid="help-contact-message"
              />
            </Field>
            <div className="help-contact-honeypot" aria-hidden="true">
              <label htmlFor="help-contact-company">{t("help.contact.honeypotLabel")}</label>
              <input
                id="help-contact-company"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(event) => setHoneypot(event.target.value)}
              />
            </div>
            <div className="help-contact-actions">
              <Button type="submit" loading={loading} disabled={loading || !email}>
                {loading ? t("help.contact.submitting") : t("help.contact.submit")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
