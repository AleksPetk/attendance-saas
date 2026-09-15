/**
 * Browser parity with frontend kioskPersonInitials.
 * Never throws on null/undefined names (avoids blank Electron windows).
 */
export function initials(name?: string | null): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

/**
 * Browser GroupKioskScreen card label: `p.name || t("participantFallback")`.
 * Avatar still receives the raw name (initials → "?" when empty).
 */
export function kioskParticipantDisplayName(name: unknown, fallback: string): string {
  if (name == null || name === "") return fallback;
  return String(name);
}
