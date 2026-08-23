import "./kioskConfirmation.css";
import { CONFIRMATION_TEMPLATE_IDS, normalizeConfirmationTemplate } from "./kioskConfirmation.js";

function normalizeTemplate(template) {
  return normalizeConfirmationTemplate(template);
}

function CheckIcon({ className = "" }) {
  return (
    <div className={`kc-tpl-icon ${className}`.trim()} aria-hidden="true">
      ✓
    </div>
  );
}

function CleanTemplate({ message }) {
  return (
    <div className="kc-tpl kc-tpl-clean">
      <div className="kc-tpl-clean-card">
        <div className="kc-tpl-clean-accent" aria-hidden="true" />
        <CheckIcon className="kc-tpl-icon--circle" />
        <p className="kc-tpl-message">{message}</p>
      </div>
    </div>
  );
}

function BusinessTemplate({ message }) {
  return (
    <div className="kc-tpl kc-tpl-business">
      <div className="kc-tpl-business-panel">
        <div className="kc-tpl-business-aside">
          <span className="kc-tpl-business-badge" aria-hidden="true">
            SUCCESS
          </span>
          <CheckIcon className="kc-tpl-icon--square" />
        </div>
        <div className="kc-tpl-business-divider" aria-hidden="true" />
        <div className="kc-tpl-business-body">
          <p className="kc-tpl-message">{message}</p>
        </div>
      </div>
    </div>
  );
}

function FriendlyTemplate({ message }) {
  return (
    <div className="kc-tpl kc-tpl-friendly">
      <div className="kc-tpl-friendly-bubble">
        <div className="kc-tpl-friendly-head">
          <CheckIcon className="kc-tpl-icon--soft" />
        </div>
        <p className="kc-tpl-message">{message}</p>
        <span className="kc-tpl-friendly-tail" aria-hidden="true" />
      </div>
    </div>
  );
}

function KidsTemplate({ message }) {
  return (
    <div className="kc-tpl kc-tpl-kids">
      <div className="kc-tpl-kids-card">
        <span className="kc-deco kc-deco-star kc-deco--tl" aria-hidden="true">
          ★
        </span>
        <span className="kc-deco kc-deco-dot kc-deco--tr" aria-hidden="true" />
        <span className="kc-deco kc-deco-star kc-deco--br" aria-hidden="true">
          ★
        </span>
        <span className="kc-deco kc-deco-dot kc-deco--bl" aria-hidden="true" />
        <CheckIcon className="kc-tpl-icon--kids" />
        <p className="kc-tpl-message">{message}</p>
      </div>
    </div>
  );
}

function FitnessTemplate({ message }) {
  return (
    <div className="kc-tpl kc-tpl-fitness">
      <div className="kc-tpl-fitness-panel">
        <div className="kc-tpl-fitness-stripe" aria-hidden="true" />
        <div className="kc-tpl-fitness-slash" aria-hidden="true" />
        <div className="kc-tpl-fitness-inner">
          <CheckIcon className="kc-tpl-icon--fitness" />
          <p className="kc-tpl-message">{message}</p>
        </div>
      </div>
    </div>
  );
}

function EventTemplate({ message }) {
  return (
    <div className="kc-tpl kc-tpl-event">
      <div className="kc-tpl-event-ticket">
        <div className="kc-tpl-event-stub">
          <CheckIcon className="kc-tpl-icon--event" />
        </div>
        <div className="kc-tpl-event-perforation" aria-hidden="true" />
        <div className="kc-tpl-event-main">
          <p className="kc-tpl-message">{message}</p>
        </div>
      </div>
    </div>
  );
}

function CelebrationTemplate({ message }) {
  return (
    <div className="kc-tpl kc-tpl-celebration">
      <div className="kc-tpl-celebration-frame">
        <span className="kc-deco kc-deco-spark kc-deco--1" aria-hidden="true">
          ✦
        </span>
        <span className="kc-deco kc-deco-spark kc-deco--2" aria-hidden="true">
          ✦
        </span>
        <span className="kc-deco kc-deco-spark kc-deco--3" aria-hidden="true">
          ✦
        </span>
        <div className="kc-tpl-celebration-halo" aria-hidden="true" />
        <CheckIcon className="kc-tpl-icon--celebration" />
        <p className="kc-tpl-message">{message}</p>
      </div>
    </div>
  );
}

function MinimalTemplate({ message }) {
  return (
    <div className="kc-tpl kc-tpl-minimal">
      <div className="kc-tpl-minimal-stack">
        <CheckIcon className="kc-tpl-icon--minimal" />
        <p className="kc-tpl-message">{message}</p>
        <span className="kc-tpl-minimal-rule" aria-hidden="true" />
      </div>
    </div>
  );
}

const TEMPLATE_COMPONENTS = {
  clean: CleanTemplate,
  business: BusinessTemplate,
  friendly: FriendlyTemplate,
  kids: KidsTemplate,
  fitness: FitnessTemplate,
  event: EventTemplate,
  celebration: CelebrationTemplate,
  minimal: MinimalTemplate,
};

/**
 * Shared confirmation presentation for live kiosk + settings previews.
 * Template controls layout only; message is pre-resolved plain text.
 */
export default function KioskConfirmationView({
  template = "clean",
  message = "",
  accentColor,
  accentStyle,
  compact = false,
  live = false,
}) {
  const safeTemplate = normalizeTemplate(template);
  const TemplateBody = TEMPLATE_COMPONENTS[safeTemplate] || CleanTemplate;
  const style =
    accentStyle ||
    (accentColor ? { "--kc-accent": accentColor, "--kc-accent-gradient": accentColor } : undefined);

  const classNames = [
    "kiosk-confirmation",
    `kiosk-confirmation--${safeTemplate}`,
    live ? "kiosk-confirmation--live" : "",
    compact ? "kiosk-confirmation--preview" : "",
    compact ? "kiosk-confirmation--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      style={style}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-hidden={live ? undefined : true}
    >
      <TemplateBody message={message} />
    </div>
  );
}

export { CONFIRMATION_TEMPLATE_IDS as TEMPLATE_IDS, normalizeConfirmationTemplate as normalizeTemplate };
