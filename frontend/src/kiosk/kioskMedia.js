/**
 * Canonical kiosk media URL resolution for Builder and Live.
 *
 * Root-relative /media/ paths must resolve against the API origin, not the SPA host.
 * Temporary blob: URLs are only valid while the Builder holds the object URL.
 */

export function resolveKioskMediaUrl(url, { allowBlob = false } = {}) {
  if (url == null) return "";
  const value = String(url).trim();
  if (!value) return "";
  if (value.startsWith("blob:")) {
    return allowBlob ? value : "";
  }
  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  if (value.startsWith("/")) {
    const base = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";
    const origin = String(base || "").replace(/\/$/, "");
    return origin ? `${origin}${value}` : value;
  }
  return value;
}
