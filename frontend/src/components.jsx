import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { brandLogoText } from "./assets/brand/brandLogo.js";

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

export function Wordmark({ subtitle, className = "", logo = false, name = "CheckStation" }) {
  return (
    <div className={`wordmark ${logo ? "wordmark-with-logo" : ""} ${className}`.trim()}>
      {logo ? (
        <picture className="wordmark-logo-picture">
          <source type="image/avif" srcSet={brandLogoText.avifSrc} />
          <source type="image/webp" srcSet={brandLogoText.webpSrc} />
          <img
            className="wordmark-logo"
            src={brandLogoText.pngSrc}
            alt={brandLogoText.alt}
            width={brandLogoText.width}
            height={brandLogoText.height}
            decoding="async"
          />
        </picture>
      ) : (
        <span className="wordmark-main">{name}</span>
      )}
      {subtitle ? <span className="wordmark-sub">{subtitle}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Connection visual (decorative)                                      */
/* ------------------------------------------------------------------ */

export function ConnectionVisual({ className = "" }) {
  return (
    <div className={`connection-visual ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="conn-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="50%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>
        <path
          className="conn-line conn-line-1"
          d="M60 160 H140 M260 160 H340 M200 80 V120 M200 200 V240"
          stroke="url(#conn-grad)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          className="conn-line conn-line-2"
          d="M140 160 Q170 160 200 120 Q230 80 260 80"
          stroke="url(#conn-grad)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />
        <circle className="conn-node" cx="60" cy="160" r="8" fill="#2563EB" />
        <circle className="conn-node" cx="140" cy="160" r="6" fill="#22D3EE" />
        <circle className="conn-node conn-node-live" cx="200" cy="120" r="10" fill="#22C55E" />
        <circle className="conn-node" cx="260" cy="80" r="6" fill="#22D3EE" />
        <circle className="conn-node" cx="340" cy="160" r="8" fill="#2563EB" />
        <circle className="conn-node" cx="200" cy="240" r="6" fill="#22D3EE" />
        <rect x="155" y="145" width="90" height="30" rx="8" fill="rgba(37,99,235,0.12)" stroke="rgba(37,99,235,0.25)" />
        <rect x="55" y="55" width="70" height="36" rx="8" fill="rgba(34,211,238,0.1)" stroke="rgba(34,211,238,0.2)" />
        <rect x="275" y="55" width="70" height="36" rx="8" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.2)" />
      </svg>
      <div className="connection-labels">
        <span>Members</span>
        <span>Groups</span>
        <span>Kiosk</span>
        <span>History</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Auth layout                                                         */
/* ------------------------------------------------------------------ */

export function AuthLayout({
  title,
  lead,
  footnote,
  children,
  variant = "owner",
  visualContent = null,
}) {
  return (
    <div className={`auth-page auth-page-${variant}`}>
      <div className="auth-page-visual">
        {visualContent || (
          <>
            <Link to="/" className="auth-page-brand">
              <Wordmark subtitle="Configurable check-in platform" />
            </Link>
            <ConnectionVisual className="auth-connection" />
            <p className="auth-page-tagline">
              Connect Members, Groups, kiosks, and history in one workspace.
            </p>
          </>
        )}
      </div>
      <div className="auth-page-form-wrap">
        <div className="auth-card">
          <header className="auth-header">
            <h1>{title}</h1>
            {lead ? <p className="auth-lead">{lead}</p> : null}
          </header>
          {children}
          {footnote ? <div className="auth-footnote">{footnote}</div> : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export function Button({
  children,
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  disabled,
  className = "",
  ...props
}) {
  const classes = [
    variant === "primary" && "btn-primary",
    variant === "secondary" && "btn-secondary",
    variant === "danger" && "btn-danger-soft",
    variant === "text" && "btn-text",
    variant === "ghost" && "btn-ghost",
    variant === "success" && "btn-success",
    size === "sm" && "btn-sm",
    block && "btn-block",
    loading && "btn-loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} disabled={disabled || loading} {...props}>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      <span className="btn-label">{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Cards & layout                                                      */
/* ------------------------------------------------------------------ */

export function Card({ children, className = "", glow = false }) {
  return <div className={`card-surface ${glow ? "card-glow" : ""} ${className}`.trim()}>{children}</div>;
}

export function PageHeader({ title, description, actions, eyebrow, meta }) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        {meta ? (
          <div className="page-header-title-row">
            <h2>{title}</h2>
            {meta}
          </div>
        ) : (
          <h2>{title}</h2>
        )}
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="header-actions">{actions}</div> : null}
    </header>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  return (
    <div className="confirm-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-modal">
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SectionHeader({ title, description }) {
  return (
    <header className="section-header-inline">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

export function StatCard({ label, value, hint, accent = "blue", onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`stat-card stat-card-${accent}${onClick ? " stat-card-clickable" : ""}`}
      onClick={onClick}
    >
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value">{value}</span>
      {hint ? <span className="stat-card-hint">{hint}</span> : null}
    </Tag>
  );
}

export function EmptyState({ title, body, action, icon }) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges & alerts                                                     */
/* ------------------------------------------------------------------ */

export function ActionBadge({ action }) {
  const map = {
    check_in: { label: "Check-in", className: "action-check-in" },
    check_out: { label: "Check-out", className: "action-check-out" },
    break_start: { label: "Break start", className: "action-break" },
    break_end: { label: "Break end", className: "action-break" },
  };
  const info = map[action] || { label: action, className: "action-default" };
  return <span className={`action-badge ${info.className}`}>{info.label}</span>;
}

export function Badge({ children, variant = "default" }) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

export function Alert({ message, variant = "error" }) {
  if (!message) return null;
  return (
    <div className={`alert alert-${variant}`} role="alert">
      {message}
    </div>
  );
}

export function ErrorBanner({ message }) {
  return <Alert message={message} variant="error" />;
}

export function SuccessBanner({ message }) {
  return <Alert message={message} variant="success" />;
}

/* ------------------------------------------------------------------ */
/* Form primitives                                                     */
/* ------------------------------------------------------------------ */

export function Toggle({ label, checked, onChange, hint, disabled = false }) {
  return (
    <div className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <span className="toggle-copy">
        <strong>{label}</strong>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        className={`toggle ${checked ? "on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

export function PlanHint({ plan, children }) {
  return (
    <span className="plan-hint" title="Placeholder for later subscription placement">
      {children}
      <em>{plan}</em>
    </span>
  );
}

export function StatusBadge({ status, children }) {
  const label = children || {
    active: "Active",
    archived: "Archived",
    deleted: "Deleted",
    inactive: "Inactive",
    "group-only": "Group-only",
    setup_incomplete: "Setup incomplete",
  }[status] || status;
  return <span className={`status-badge ${status}`}>{label}</span>;
}

export function PhotoThumb({ url, name, size = "md" }) {
  if (url) {
    return <img className={`photo-thumb photo-thumb-${size}`} src={url} alt="" />;
  }
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  let initials = "?";
  if (parts.length === 1) {
    initials = parts[0].slice(0, 2).toUpperCase();
  } else if (parts.length > 1) {
    initials = `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (
    <span className={`photo-fallback photo-thumb-${size}`} aria-hidden="true">
      {initials}
    </span>
  );
}

function CameraBadge() {
  return (
    <span className="profile-photo-edit-badge" aria-hidden="true">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <path
          d="M7.2 4.5h5.6l.9 1.4H16a1.5 1.5 0 0 1 1.5 1.5v7.1A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5V7.4A1.5 1.5 0 0 1 4 5.9h2.3l.9-1.4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10.6" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

export function EditableProfilePhoto({
  url,
  name,
  size = "xl",
  onSelectFile,
  onRemove,
  disabled = false,
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasPhoto = Boolean(url);
  const label = hasPhoto ? "Edit profile photo" : "Add profile photo";

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function openPicker() {
    setMenuOpen(false);
    inputRef.current?.click();
  }

  function handleButtonClick() {
    if (disabled) {
      return;
    }
    if (hasPhoto) {
      setMenuOpen((open) => !open);
      return;
    }
    openPicker();
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (file) {
      onSelectFile(file);
    }
  }

  return (
    <div className="profile-photo-edit" ref={rootRef}>
      <button
        type="button"
        className="profile-photo-edit-button"
        aria-label={label}
        aria-haspopup={hasPhoto ? "menu" : undefined}
        aria-expanded={hasPhoto ? menuOpen : undefined}
        onClick={handleButtonClick}
        disabled={disabled}
      >
        <PhotoThumb url={url} name={name} size={size} />
        <span className="profile-photo-edit-overlay">
          <CameraBadge />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      {menuOpen ? (
        <div className="profile-photo-edit-menu" role="menu">
          <button type="button" role="menuitem" onClick={openPicker}>
            Change photo
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
          >
            Remove photo
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Field({ label, hint, children, className = "", error }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">{label}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function usePasswordVisibility() {
  const [visible, setVisible] = useState(false);
  return { visible, setVisible };
}

function PasswordVisibilityIcon({ hidden }) {
  if (hidden) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="12"
          r="3.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9.88 9.88A3.1 3.1 0 0 0 12 15.1a3.1 3.1 0 0 0 2.22-.92M6.53 6.53C4.3 8.02 2.7 10.2 2.25 12c.75 1.8 3.75 6.75 9.75 6.75 1.86 0 3.5-.45 4.9-1.16M17.47 17.47C19.7 15.98 21.3 13.8 21.75 12 21 10.2 18 5.25 12 5.25c-.78 0-1.52.08-2.22.23"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PasswordInput({
  visible,
  onVisibleChange,
  showToggle = true,
  className = "",
  ...props
}) {
  const [uncontrolledVisible, setUncontrolledVisible] = useState(false);
  const isControlled = typeof visible === "boolean";
  const isVisible = isControlled ? visible : uncontrolledVisible;

  function setNextVisible(next) {
    if (!isControlled) {
      setUncontrolledVisible(next);
    }
    onVisibleChange?.(next);
  }

  return (
    <div className={`password-input${showToggle ? " password-input-with-toggle" : ""}`.trim()}>
      <input
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        {...props}
        className={className}
        type={isVisible ? "text" : "password"}
      />
      {showToggle ? (
        <button
          type="button"
          className="password-toggle"
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-pressed={isVisible}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setNextVisible(!isVisible)}
        >
          <PasswordVisibilityIcon hidden={!isVisible} />
        </button>
      ) : null}
    </div>
  );
}

export function SectionCard({ title, description, children, className = "", id, tutorialTarget }) {
  return (
    <section
      className={`section-card ${className}`.trim()}
      id={id}
      data-tutorial-target={tutorialTarget || undefined}
    >
      <header className="section-card-header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="section-card-body">{children}</div>
    </section>
  );
}

export function FormSection({ title, description, children }) {
  return (
    <section className="form-section">
      <header className="form-section-header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function CodeBadge({ children }) {
  return <code className="code-badge">{children}</code>;
}

export function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback ignored */
    }
  }

  return (
    <button type="button" className="btn-secondary btn-sm copy-btn" onClick={handleCopy}>
      {copied ? "Copied!" : label}
    </button>
  );
}

export const KIOSK_THEME_LABELS = {
  classic: "Station Blue",
  modern: "Live Green",
};

export function kioskThemeLabel(theme) {
  return KIOSK_THEME_LABELS[theme] || theme;
}
