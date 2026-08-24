import { useState } from "react";

import { kioskAvatarToneStep, kioskPersonInitials } from "./kioskPersonInitials.js";

export { PHOTO_CAPABLE_CARD_TEMPLATE_IDS, kioskAvatarToneStep, kioskPersonInitials } from "./kioskPersonInitials.js";

function initialsMarkup(initials, { className = "kiosk-person-initials" } = {}) {
  return <span className={className}>{initials}</span>;
}

/**
 * Shared participant/class visual for photo-capable Card templates.
 *
 * variant "person" — Member or Visitor; optional photo with initials fallback.
 * variant "class" — Structured Class card; initials only, class-styled frame.
 */
export function KioskPersonAvatar({ name, photoUrl, variant = "person", size = "selection" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = kioskPersonInitials(name);
  const isClass = variant === "class";
  const showPhoto = !isClass && Boolean(photoUrl) && !imageFailed;
  const toneStep = kioskAvatarToneStep(name);

  const classNames = [
    "kiosk-person-avatar",
    isClass ? "kiosk-class-avatar" : "",
    size === "compact" ? "kiosk-person-avatar--compact" : "",
    showPhoto ? "kiosk-person-avatar--photo" : "kiosk-person-avatar--fallback",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classNames}
      aria-hidden="true"
      data-avatar-tone={toneStep}
      style={{ "--avatar-tone-step": toneStep }}
    >
      {showPhoto ? (
        <img src={photoUrl} alt="" onError={() => setImageFailed(true)} />
      ) : isClass ? (
        <span className="kiosk-class-avatar-inner">
          {initialsMarkup(initials)}
        </span>
      ) : (
        initialsMarkup(initials)
      )}
    </span>
  );
}
