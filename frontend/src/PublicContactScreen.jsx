import { useEffect, useMemo, useRef, useState } from "react";
import PublicPageShell from "./PublicPageShell.jsx";
import { api, errorMessage } from "./api.js";
import { publicDocsPageUrl } from "./publicFooterLinks.js";
import {
  HONEYPOT_FIELD,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUBJECT_MAX,
  SUBJECT_MIN,
  publicFaqUrl,
  publicSiteOrigin,
  suggestedSubject,
} from "./contactForm.js";

function PageTitle({ title, description, canonicalPath }) {
  useEffect(() => {
    document.title = title;
    let el = document.querySelector('meta[name="description"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "description");
      document.head.appendChild(el);
    }
    el.setAttribute("content", description);
    const origin = publicSiteOrigin();
    const href = origin && canonicalPath ? `${origin}${canonicalPath}` : "";
    if (!href) return;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", href);
  }, [title, description, canonicalPath]);
  return null;
}

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p className="contact-field-error" id={id} role="alert">
      {message}
    </p>
  );
}

function markdownPreview(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

export default function PublicContactScreen() {
  const [catalog, setCatalog] = useState({ categories: [], turnstile_site_key: "" });
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [openSlug, setOpenSlug] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const widgetRef = useRef(null);
  const widgetId = useRef(null);

  const category = useMemo(
    () => (catalog.categories || []).find((item) => item.id === categoryId) || null,
    [catalog.categories, categoryId],
  );
  const subcategory = useMemo(
    () => (category?.subcategories || []).find((item) => item.id === subcategoryId) || null,
    [category, subcategoryId],
  );
  const classified = Boolean(category && subcategory);

  useEffect(() => {
    let cancelled = false;
    api.getContactCategories().then((result) => {
      if (!cancelled && result?.data) setCatalog(result.data);
    }).catch(() => {
      if (!cancelled) setFormError("Contact options could not be loaded.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!categoryId || !subcategoryId) {
      setSuggestions([]);
      setOpenSlug("");
      return undefined;
    }
    let cancelled = false;
    api.getContactSuggestions(categoryId, subcategoryId).then((result) => {
      if (!cancelled) setSuggestions(result.data?.items || []);
    }).catch(() => {
      if (!cancelled) setSuggestions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [categoryId, subcategoryId]);

  useEffect(() => {
    if (!subjectTouched && category && subcategory) {
      setSubject(suggestedSubject(category.label, subcategory.label));
    }
  }, [category, subcategory, subjectTouched]);

  useEffect(() => {
    const siteKey = catalog.turnstile_site_key;
    if (!siteKey || !classified || !widgetRef.current) return undefined;

    function renderWidget() {
      if (!window.turnstile || !widgetRef.current) return;
      if (widgetId.current != null) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        callback: (token) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });
    }

    if (window.turnstile) {
      renderWidget();
      return () => {
        if (widgetId.current != null && window.turnstile) {
          window.turnstile.remove(widgetId.current);
          widgetId.current = null;
        }
      };
    }
    const existing = document.querySelector("script[data-checkstation-turnstile]");
    if (existing) {
      existing.addEventListener("load", renderWidget);
      return () => existing.removeEventListener("load", renderWidget);
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.checkstationTurnstile = "true";
    script.addEventListener("load", renderWidget);
    document.head.appendChild(script);
    return () => {
      script.removeEventListener("load", renderWidget);
      if (widgetId.current != null && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [catalog.turnstile_site_key, classified]);

  function resetForm() {
    setCategoryId("");
    setSubcategoryId("");
    setSuggestions([]);
    setOpenSlug("");
    setEmail("");
    setName("");
    setSubject("");
    setSubjectTouched(false);
    setMessage("");
    setHoneypot("");
    setTurnstileToken("");
    setErrors({});
    setFormError("");
    if (widgetId.current != null && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setFormError("");
    setErrors({});
    try {
      const result = await api.submitContact({
        category: categoryId,
        subcategory: subcategoryId,
        email,
        name,
        subject,
        message,
        client_type: "public_web",
        page_path: "/contact",
        turnstile_token: turnstileToken,
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
        setFormError("Too many messages. Please try again later.");
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

  const docsFaqBase = publicDocsPageUrl();

  return (
    <PublicPageShell>
      <PageTitle
        title="Contact — CheckStation"
        description="Contact CheckStation. Choose a topic to see related help, then send a message if you still need us."
        canonicalPath="/contact"
      />
      <section className="public-section contact-page">
        <header className="contact-intro">
          <p className="contact-eyebrow">Support</p>
          <h1>Contact CheckStation</h1>
          <p>
            Choose a topic and we’ll suggest relevant answers first. If they don’t solve the issue, send us a message below.
          </p>
        </header>

        {success ? (
          <div className="contact-success" role="status">
            <span className="contact-success-mark" aria-hidden="true">✓</span>
            <div>
              <h2>{success.delivered === false ? "Message saved" : "Message sent"}</h2>
              <p>{success.message || "We've received your message."}</p>
              {success.reference ? (
                <p className="contact-reference">Reference {success.reference}</p>
              ) : null}
              <button type="button" className="contact-secondary-btn" onClick={() => setSuccess(null)}>
                Send another message
              </button>
            </div>
          </div>
        ) : null}

        <form className="contact-form" onSubmit={handleSubmit} noValidate>
          <section className="contact-topic-card" aria-labelledby="contact-topic-title">
            <div className="contact-section-heading">
              <p className="contact-eyebrow">Get help</p>
              <h2 id="contact-topic-title">What do you need help with?</h2>
              <p>Choose the closest topic so we can surface the most useful CheckStation guidance.</p>
            </div>
            <div className="contact-grid contact-topic-grid">
              <div className="contact-field">
                <label htmlFor="contact-category">Category</label>
                <select
                  id="contact-category"
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    setSubcategoryId("");
                    setSubjectTouched(false);
                  }}
                  aria-invalid={errors.category ? "true" : "false"}
                  aria-describedby={errors.category ? "contact-category-error" : undefined}
                  required
                >
                  <option value="">Select a category</option>
                  {(catalog.categories || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <FieldError id="contact-category-error" message={errors.category} />
              </div>
              <div className={`contact-field contact-dependent-field${category ? " is-ready" : ""}`}>
                <label htmlFor="contact-subcategory">Subcategory</label>
                <select
                  id="contact-subcategory"
                  value={subcategoryId}
                  onChange={(event) => {
                    setSubcategoryId(event.target.value);
                    setSubjectTouched(false);
                  }}
                  disabled={!category}
                  aria-invalid={errors.subcategory ? "true" : "false"}
                  aria-describedby={errors.subcategory ? "contact-subcategory-error" : undefined}
                  required
                >
                  <option value="">Select a subcategory</option>
                  {(category?.subcategories || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {!category ? <span className="contact-field-hint">Choose a category first</span> : null}
                <FieldError id="contact-subcategory-error" message={errors.subcategory} />
              </div>
            </div>
          </section>

          {classified ? (
            <section className="contact-help" aria-live="polite" aria-labelledby="contact-help-title">
              <div className="contact-section-heading contact-help-heading">
                <p className="contact-eyebrow">Suggested answers</p>
                <h2 id="contact-help-title">You may find your answer here</h2>
                <p>These answers match the topic you selected.</p>
              </div>
              {suggestions.length === 0 ? (
                <p className="contact-help-empty">No matching help articles for this topic yet.</p>
              ) : (
                <ul className="contact-help-list">
                  {suggestions.map((item) => {
                    const open = openSlug === item.slug;
                    return (
                      <li key={item.slug} className={open ? "is-open" : ""}>
                        <button
                          type="button"
                          className="contact-help-question"
                          aria-expanded={open ? "true" : "false"}
                          aria-controls={`contact-help-a-${item.slug}`}
                          id={`contact-help-q-${item.slug}`}
                          onClick={() => setOpenSlug(open ? "" : item.slug)}
                        >
                          <span>{item.question}</span>
                          <span className="contact-help-chevron" aria-hidden="true">⌄</span>
                        </button>
                        <div
                          className="contact-help-answer"
                          id={`contact-help-a-${item.slug}`}
                          role="region"
                          aria-labelledby={`contact-help-q-${item.slug}`}
                          hidden={!open}
                        >
                          <p
                            className="contact-help-body"
                            dangerouslySetInnerHTML={{
                              __html: markdownPreview(item.answer_markdown || item.answer_preview),
                            }}
                          />
                          <a
                            className="contact-help-docs"
                            href={publicFaqUrl(docsFaqBase, item.question)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open in CheckStation FAQ
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          <div className="contact-hp" aria-hidden="true">
            <label htmlFor="contact-company">Company website</label>
            <input
              id="contact-company"
              name={HONEYPOT_FIELD}
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {classified ? (
            <section className="contact-message-section" aria-labelledby="contact-message-title">
              <div className="contact-section-heading">
                <p className="contact-eyebrow">Still need help?</p>
                <h2 id="contact-message-title">Send us a message</h2>
                <p>Tell us what happened and we’ll route your message to the right place.</p>
              </div>
              <div className="contact-message-card">
                <div className="contact-grid">
                  <div className="contact-field">
                    <label htmlFor="contact-email">Email</label>
                    <input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                      maxLength={254}
                      aria-invalid={errors.email ? "true" : "false"}
                      aria-describedby={errors.email ? "contact-email-error" : undefined}
                    />
                    <FieldError id="contact-email-error" message={errors.email} />
                  </div>
                  <div className="contact-field">
                    <label htmlFor="contact-name">Name (optional)</label>
                    <input
                      id="contact-name"
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      maxLength={80}
                    />
                  </div>
                </div>

                <div className="contact-field">
                  <label htmlFor="contact-subject">Subject</label>
                  <input
                    id="contact-subject"
                    type="text"
                    value={subject}
                    onChange={(event) => {
                      setSubjectTouched(true);
                      setSubject(event.target.value);
                    }}
                    required
                    minLength={SUBJECT_MIN}
                    maxLength={SUBJECT_MAX}
                    aria-invalid={errors.subject ? "true" : "false"}
                    aria-describedby={errors.subject ? "contact-subject-error" : undefined}
                  />
                  <FieldError id="contact-subject-error" message={errors.subject} />
                </div>

                <div className="contact-field">
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    required
                    minLength={MESSAGE_MIN}
                    maxLength={MESSAGE_MAX}
                    rows={7}
                    aria-invalid={errors.message ? "true" : "false"}
                    aria-describedby={errors.message ? "contact-message-error" : undefined}
                  />
                  <FieldError id="contact-message-error" message={errors.message} />
                </div>

                <div className="contact-turnstile" ref={widgetRef} />
                {!catalog.turnstile_site_key ? (
                  <p className="contact-field-error" role="alert">
                    Contact protection is not configured on this environment.
                  </p>
                ) : null}

                <div className="contact-submit-row">
                  <button type="submit" className="contact-submit" disabled={loading}>
                    {loading ? "Sending…" : "Send message"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {formError ? (
            <p className="contact-form-error" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      </section>
    </PublicPageShell>
  );
}
