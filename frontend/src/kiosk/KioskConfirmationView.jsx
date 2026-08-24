import "./kioskConfirmation.css";
import "./confirmationFlow.css";
import {
  normalizeConfirmationVisualFamily,
  confirmationVisualAccent,
} from "./kioskConfirmation.js";

function CheckMark() {
  return (
    <span className="kc-unified-check" aria-hidden="true">
      ✓
    </span>
  );
}

/**
 * Unified confirmation presentation for live kiosk.
 * Visual family comes from the active Card/Input template (data-kc-family),
 * not from the deprecated settings confirmation_template field.
 */
export default function KioskConfirmationView({
  template = "clean",
  message = "",
  accentColor,
  accentStyle,
  compact = false,
  live = false,
}) {
  const family = normalizeConfirmationVisualFamily(template);
  const familyAccent = confirmationVisualAccent(family);
  const style = {
    "--kc-accent": familyAccent,
    "--kc-accent-2": familyAccent,
    "--kc-accent-gradient": familyAccent,
    "--kc-accent-mode": "solid",
    ...(accentStyle || {}),
    ...(accentColor
      ? {
          "--kc-accent": accentColor,
          "--kc-accent-gradient": accentColor,
        }
      : {}),
  };

  const classNames = [
    "kiosk-confirmation",
    "kiosk-confirmation--unified",
    `kiosk-confirmation--${family}`,
    live ? "kiosk-confirmation--live" : "",
    compact ? "kiosk-confirmation--preview" : "",
    compact ? "kiosk-confirmation--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      data-kc-family={family}
      style={style}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-hidden={live ? undefined : true}
    >
      <div className="kc-unified-panel">
        <div className="kc-unified-mark" aria-hidden="true">
          <CheckMark />
        </div>
        <p className="kc-unified-message">{message}</p>
      </div>
    </div>
  );
}

export {
  normalizeConfirmationVisualFamily as normalizeTemplate,
};
