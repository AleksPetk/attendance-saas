/** Photo-capable Card templates that show the avatar slot at runtime. */
export const PHOTO_CAPABLE_CARD_TEMPLATE_IDS = [
  "photo",
  "kids_bubble",
  "ticket",
  "id_badge",
  "polaroid",
  "executive",
  "pass",
];

/** Input families that show a generic visual before identification. */
export const PHOTO_CAPABLE_INPUT_TEMPLATE_IDS = [
  "polaroid",
  "id_badge",
  "kids_bubble",
];

/**
 * Derive 1–2 character initials for kiosk cards.
 * Nami -> N; Alex Chen -> AC; Margaret Hamilton -> MH
 */
export function kioskPersonInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

/** Deterministic 0–4 tone step for fallback backgrounds (stable per display name). */
export function kioskAvatarToneStep(name) {
  const text = String(name || "").trim().toLowerCase();
  if (!text) return 0;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % 5;
}
