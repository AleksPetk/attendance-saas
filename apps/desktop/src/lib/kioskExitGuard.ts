/** Window after successful kiosk exit — skip enter + force leave /kiosk (browser parity). */

const GUARD_MS = 5000;

let exitGuardUntil = 0;

export function beginDesktopKioskExitGuard(now = Date.now()): void {
  exitGuardUntil = now + GUARD_MS;
}

export function isDesktopKioskExitGuardActive(now = Date.now()): boolean {
  return now < exitGuardUntil;
}

/** Test helper — resets the guard clock. */
export function resetDesktopKioskExitGuardForTests(): void {
  exitGuardUntil = 0;
}
