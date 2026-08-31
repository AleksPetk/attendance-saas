export const MANUAL_REFRESH_SUCCESS_MS = 1500;
export const MANUAL_REFRESH_FAILURE_MS = 2000;

export function accountStatusRefreshButtonLabel(phase) {
  if (phase === "loading") return "Refreshing...";
  if (phase === "success") return "Updated";
  if (phase === "error") return "Refresh failed";
  return "Refresh";
}

export function accountStatusRefreshButtonDisabled(phase) {
  return phase === "loading";
}

export function canStartManualStatusRefresh(inFlight) {
  return !inFlight;
}
