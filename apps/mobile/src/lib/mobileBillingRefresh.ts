/** Pure helpers for mobile Plan/account billing refresh debounce and restore outcomes. */

export const MOBILE_BILLING_FOREGROUND_MIN_MS = 750;

export type BillingRefreshGate = {
  inFlight: boolean;
  lastRefreshAt: number | null;
};

export function shouldRunBillingRefresh(args: {
  now: number;
  gate: BillingRefreshGate;
  minElapsedMs?: number;
  force?: boolean;
}): boolean {
  if (args.gate.inFlight) return false;
  if (args.force) return true;
  if (args.gate.lastRefreshAt == null) return true;
  const minElapsed = args.minElapsedMs ?? MOBILE_BILLING_FOREGROUND_MIN_MS;
  return args.now - args.gate.lastRefreshAt >= minElapsed;
}

export function shouldRefreshBillingOnAppState(args: {
  previous: string | null;
  next: string;
}): boolean {
  if (args.next !== "active") return false;
  return args.previous === "background" || args.previous === "inactive";
}

export type RestoreAttemptResult =
  | { kind: "activated" }
  | { kind: "inactive" }
  | { kind: "error"; error: unknown };

export type RestoreSummary =
  | { outcome: "success" }
  | { outcome: "error"; error: unknown };

const RESTORE_ERROR_PRIORITY = [
  "google_purchase_bound_elsewhere",
  "apple_transaction_bound_elsewhere",
  "purchase_source_locked",
  "purchase_source_apple",
  "purchase_source_google",
  "purchase_source_stripe",
  "purchase_source_not_stripe",
  "google_play_not_configured",
  "apple_jws_invalid",
  "google_purchase_not_found",
];

export function billingErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const direct = (error as { code?: string }).code;
  if (direct) return String(direct);
  const nested = (error as { data?: { code?: string } }).data?.code;
  return nested ? String(nested) : "";
}

function restoreErrorRank(error: unknown): number {
  const code = billingErrorCode(error);
  const index = RESTORE_ERROR_PRIORITY.indexOf(code);
  return index === -1 ? RESTORE_ERROR_PRIORITY.length : index;
}

/** Prefer activated success; otherwise surface the most actionable verify error. */
export function summarizeRestoreAttempts(attempts: RestoreAttemptResult[]): RestoreSummary {
  if (attempts.some((item) => item.kind === "activated")) {
    return { outcome: "success" };
  }
  const errors = attempts
    .filter((item): item is { kind: "error"; error: unknown } => item.kind === "error")
    .map((item) => item.error)
    .sort((left, right) => restoreErrorRank(left) - restoreErrorRank(right));
  if (errors.length) {
    return { outcome: "error", error: errors[0] };
  }
  return { outcome: "error", error: { code: "restore_activation_failed" } };
}
