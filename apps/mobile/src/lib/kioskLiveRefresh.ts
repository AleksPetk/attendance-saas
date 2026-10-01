/** Pure helpers for live kiosk soft/foreground refresh scheduling. */

export const KIOSK_SOFT_REFRESH_MS = 5 * 60 * 1000;
/** Ignore rapid AppState chatter; still refresh after real backgrounding. */
export const KIOSK_FOREGROUND_MIN_ELAPSED_MS = 15 * 1000;

export type KioskRefreshIdleSnapshot = {
  busy: boolean;
  performLocked: boolean;
  hasParticipant: boolean;
  hasPendingPerson: boolean;
  hasSuccessMessage: boolean;
  showExit: boolean;
  classPinBusy: boolean;
  sessionExpired: boolean;
  refreshInFlight: boolean;
};

export function isKioskRefreshIdle(snapshot: KioskRefreshIdleSnapshot): boolean {
  return (
    !snapshot.busy
    && !snapshot.performLocked
    && !snapshot.hasParticipant
    && !snapshot.hasPendingPerson
    && !snapshot.hasSuccessMessage
    && !snapshot.showExit
    && !snapshot.classPinBusy
    && !snapshot.sessionExpired
    && !snapshot.refreshInFlight
  );
}

export function shouldRefreshOnForeground(args: {
  wasBackgrounded: boolean;
  now: number;
  lastRefreshAt: number | null;
  minElapsedMs?: number;
}): boolean {
  if (!args.wasBackgrounded) return false;
  if (args.lastRefreshAt == null) return true;
  const minElapsed = args.minElapsedMs ?? KIOSK_FOREGROUND_MIN_ELAPSED_MS;
  return args.now - args.lastRefreshAt >= minElapsed;
}

export function shouldRunPeriodicRefresh(args: {
  now: number;
  lastRefreshAt: number | null;
  intervalMs?: number;
  appActive: boolean;
}): boolean {
  if (!args.appActive) return false;
  const interval = args.intervalMs ?? KIOSK_SOFT_REFRESH_MS;
  if (args.lastRefreshAt == null) return true;
  return args.now - args.lastRefreshAt >= interval;
}

export function resolveStructuredClassAfterRefresh<T extends { id: number }>(
  previousSelected: T | null,
  nextClasses: T[],
): { selected: T | null; classReady: boolean; clearPeople: boolean } {
  if (!previousSelected) {
    return { selected: null, classReady: false, clearPeople: true };
  }
  const stillThere = nextClasses.find((entry) => entry.id === previousSelected.id) || null;
  if (!stillThere) {
    return { selected: null, classReady: false, clearPeople: true };
  }
  return { selected: stillThere, classReady: true, clearPeople: false };
}
