import type { ApiClient } from "@checkstation/api";

/**
 * Resolve kiosk/member media paths the same way Desktop/browser do:
 * absolute http(s)/data stay as-is; root-relative /media/ joins the API host origin.
 */
export function resolveMobileMediaUrl(url: string | null | undefined, apiBaseUrl: string): string {
  const value = String(url ?? "").trim();
  if (!value) return "";
  if (
    value.startsWith("data:")
    || value.startsWith("blob:")
    || value.startsWith("http://")
    || value.startsWith("https://")
    || value.startsWith("file:")
  ) {
    return value;
  }
  if (value.startsWith("/")) {
    const origin = String(apiBaseUrl || "").replace(/\/api\/?$/, "").replace(/\/$/, "");
    return origin ? `${origin}${value}` : value;
  }
  return value;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/**
 * Load protected /media/ (or absolute) assets with the session Cookie jar.
 * Returns a data: URI so WebView <img> can render without exposing tokens in the URL.
 * Does not persist or duplicate photos — transient display only (matches Desktop blob pattern).
 */
export async function loadAuthenticatedMediaDataUri(
  api: ApiClient,
  url: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const absolute = resolveMobileMediaUrl(url, api.apiBaseUrl);
  if (!absolute) throw new Error("empty media url");
  if (absolute.startsWith("data:")) return absolute;

  const headers: Record<string, string> = {};
  const cookie = api.jar.cookieHeader();
  if (cookie) headers.Cookie = cookie;

  const response = await fetchImpl(absolute, {
    method: "GET",
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`media request failed (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error("empty media body");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const safeType = contentType.split(";")[0].trim() || "image/jpeg";
  return `data:${safeType};base64,${arrayBufferToBase64(buffer)}`;
}

/** Deterministic 0–4 tone step for fallback avatars (Desktop/browser parity). */
export function kioskAvatarToneStep(name: string | null | undefined): number {
  const text = String(name || "").trim().toLowerCase();
  if (!text) return 0;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % 5;
}

export function kioskPersonInitials(name: string | null | undefined): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}
