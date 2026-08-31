import { publicStatusPageUrl } from "./publicFooterLinks.js";

export const DEFAULT_STATUS_POLL_SECONDS = 30;

export function statusApiUrl(path) {
  const suffix = String(path || "").replace(/^\/+/, "");
  return `${publicStatusPageUrl()}/api/status/${suffix}`;
}

async function statusJson(fetchImpl, path, signal) {
  const response = await fetchImpl(statusApiUrl(path), {
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

export async function fetchStatusSnapshot({ fetchImpl = globalThis.fetch, signal } = {}) {
  const [current, incidentsResult, maintenanceResult] = await Promise.all([
    statusJson(fetchImpl, "current/", signal),
    statusJson(fetchImpl, "incidents/", signal).catch(() => ({ active: [], recent: [] })),
    statusJson(fetchImpl, "maintenance/", signal).catch(() => ({ windows: [] })),
  ]);
  return {
    current,
    incidents: incidentsResult,
    maintenance: maintenanceResult,
  };
}

export function statusPollDelayMs(snapshot) {
  const seconds = Number(snapshot?.current?.poll_interval_seconds);
  const safeSeconds = Number.isFinite(seconds) && seconds > 0
    ? seconds
    : DEFAULT_STATUS_POLL_SECONDS;
  return safeSeconds * 1000;
}
