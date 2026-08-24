import "./processingFlow.css";
import {
  normalizeProcessingVisualFamily,
  processingHeadline,
} from "./kioskProcessing.js";
import { confirmationVisualAccent } from "./kioskConfirmation.js";
import { KioskParticipantSummary } from "./KioskParticipantSummary.jsx";

function ProcessingIndicator({ family }) {
  if (family === "terminal" || family === "cyber_hex") {
    return (
      <div className="kp-unified-indicator kp-unified-indicator--terminal" aria-hidden="true">
        <span className="kp-terminal-bar" />
        <span className="kp-terminal-bar" />
        <span className="kp-terminal-bar" />
      </div>
    );
  }
  if (family === "kids_bubble" || family === "playground") {
    return (
      <div className="kp-unified-indicator kp-unified-indicator--bubble" aria-hidden="true">
        <span className="kp-bubble-dot" />
        <span className="kp-bubble-dot" />
        <span className="kp-bubble-dot" />
      </div>
    );
  }
  if (family === "heart_pop" || family === "welcome") {
    return (
      <div className="kp-unified-indicator kp-unified-indicator--heart" aria-hidden="true">
        <span className="kp-heart-pulse">♥</span>
      </div>
    );
  }
  if (family === "ticket" || family === "pass") {
    return (
      <div className="kp-unified-indicator kp-unified-indicator--ticket" aria-hidden="true">
        <span className="kp-ticket-stamp">◆</span>
      </div>
    );
  }
  if (family === "comic") {
    return (
      <div className="kp-unified-indicator kp-unified-indicator--comic" aria-hidden="true">
        <span className="kp-comic-burst">!</span>
      </div>
    );
  }
  return (
    <div className="kp-unified-indicator kp-unified-indicator--spinner" aria-hidden="true">
      <span className="kp-spinner-ring" />
    </div>
  );
}

/**
 * Unified processing presentation for live kiosk action submission.
 * Visual family matches the active Card/Input flow template.
 */
export default function KioskProcessingView({
  template = "clean",
  action = "",
  participantName = "",
  photoUrl = null,
  accentColor,
  accentStyle,
  live = false,
}) {
  const family = normalizeProcessingVisualFamily(template);
  const familyAccent = confirmationVisualAccent(family);
  const headline = processingHeadline(action, participantName);
  const style = {
    "--kp-accent": familyAccent,
    "--kp-accent-2": familyAccent,
    ...(accentStyle || {}),
    ...(accentColor
      ? {
          "--kp-accent": accentColor,
        }
      : {}),
  };

  const classNames = [
    "kiosk-processing",
    "kiosk-processing--unified",
    `kiosk-processing--${family}`,
    live ? "kiosk-processing--live" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      data-kp-family={family}
      style={style}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-busy={live ? "true" : undefined}
    >
      <div className="kp-unified-panel">
        {participantName ? (
          <KioskParticipantSummary name={participantName} photoUrl={photoUrl} />
        ) : null}
        <ProcessingIndicator family={family} />
        <p className="kp-unified-headline">{headline}</p>
        <p className="kp-unified-sub">Please wait</p>
      </div>
    </div>
  );
}
