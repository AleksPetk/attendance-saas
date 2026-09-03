import { publicStatusPageUrl } from "./publicFooterLinks.js";

export const DEFAULT_STATUS_POLL_SECONDS = 30;

export function statusApiUrl(path, { lang } = {}) {
  const suffix = String(path || "").replace(/^\/+/, "");
  const base = `${publicStatusPageUrl()}/api/status/${suffix}`;
  if (!lang) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}lang=${encodeURIComponent(lang)}`;
}

async function statusJson(fetchImpl, path, signal, lang) {
  const response = await fetchImpl(statusApiUrl(path, { lang }), {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    const error = new Error("Status data is unavailable.");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function fetchStatusSnapshot({
  fetchImpl = globalThis.fetch,
  signal,
  lang,
} = {}) {
  const [current, incidentsResult, maintenanceResult] = await Promise.all([
    statusJson(fetchImpl, "current/", signal, lang),
    statusJson(fetchImpl, "incidents/", signal, lang).catch(() => ({
      active: [],
      recent: [],
    })),
    statusJson(fetchImpl, "maintenance/", signal, lang).catch(() => ({
      windows: [],
    })),
  ]);
  return {
    current,
    incidents: incidentsResult,
    maintenance: maintenanceResult,
  };
}

export function statusPollDelayMs(snapshot) {
  const seconds = Number(snapshot?.current?.poll_interval_seconds);
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0
      ? seconds
      : DEFAULT_STATUS_POLL_SECONDS;
  return safeSeconds * 1000;
}
