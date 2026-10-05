/**
 * Android hardware-back policy while the kiosk screen is active.
 *
 * Back must never pop the kiosk modal into authenticated admin routes.
 * It opens (or keeps) the exit-PIN flow instead.
 */

export type KioskAndroidBackAction =
  | "open_exit"
  | "close_exit"
  | "ignore";

export function resolveKioskAndroidBack(input: {
  exitOpen: boolean;
  sessionExpired: boolean;
}): KioskAndroidBackAction {
  if (input.sessionExpired) {
    // Session-expired overlay already requires exit PIN; never dismiss it via Back.
    return input.exitOpen ? "ignore" : "open_exit";
  }
  if (input.exitOpen) return "close_exit";
  return "open_exit";
}

/** When the workspace session is kiosk-locked, (app) routes must bounce to kiosk. */
export function shouldRedirectAppRoutesWhileKioskLocked(
  status: string,
  kioskGroupId: string | number | null | undefined,
): boolean {
  if (status !== "kiosk_locked") return false;
  if (kioskGroupId == null || kioskGroupId === "") return false;
  return true;
}

export function kioskLockRedirectHref(
  kioskGroupId: string | number,
): `/kiosk/${string}` {
  return `/kiosk/${String(kioskGroupId)}`;
}
