export function accountStatusRefreshButtonLabel(phase, labels = {}) {
  if (phase === "loading") return labels.refreshing || "Refreshing...";
  if (phase === "success") return labels.updated || "Updated";
  if (phase === "error") return labels.refreshFailed || "Refresh failed";
  return labels.refresh || "Refresh";
}

export const MANUAL_REFRESH_SUCCESS_MS = 1500;
export const MANUAL_REFRESH_FAILURE_MS = 2000;

export function accountStatusRefreshButtonDisabled(phase) {
  return phase === "loading";
}

export function canStartManualStatusRefresh(inFlight) {
  return !inFlight;
}
