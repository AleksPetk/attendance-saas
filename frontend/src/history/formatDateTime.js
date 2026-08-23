/**
 * Format a Date (or parseable timestamp) as 24-hour local time: HH:mm.
 * Uses explicit zero-padding — not browser locale — so AM/PM never appears.
 */
export function formatTime24(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
