/** Pure helpers for shared-kiosk participant inactivity reset (not soft refresh / session expiry). */

export const KIOSK_INACTIVITY_TIMEOUT_MS = 30_000;

/**
 * @typedef {{
 *   participantSensitive: boolean,
 *   interactionBusy: boolean,
 *   successVisible: boolean,
 *   exitOpen: boolean,
 *   sessionExpired?: boolean,
 *   loading?: boolean,
 * }} KioskInactivityArmSnapshot
 */

/** @param {KioskInactivityArmSnapshot} snapshot */
export function shouldArmKioskInactivity(snapshot) {
  return Boolean(
    snapshot.participantSensitive
    && !snapshot.interactionBusy
    && !snapshot.successVisible
    && !snapshot.exitOpen
    && !snapshot.sessionExpired
    && !snapshot.loading,
  );
}

/** @param {Record<string, unknown> | null | undefined} values */
export function hasNonEmptyKioskInput(values) {
  return Object.values(values || {}).some((value) => String(value ?? "").trim() !== "");
}

/**
 * @param {{ lastActivityAt: number, now: number, timeoutMs?: number }} args
 */
export function remainingInactivitySeconds(args) {
  const timeoutMs = args.timeoutMs ?? KIOSK_INACTIVITY_TIMEOUT_MS;
  return Math.max(0, Math.ceil((args.lastActivityAt + timeoutMs - args.now) / 1000));
}

/**
 * Testable single-timer controller for kiosk inactivity.
 * @param {{
 *   timeoutMs?: number,
 *   now?: () => number,
 *   setTimeoutFn?: typeof setTimeout,
 *   clearTimeoutFn?: typeof clearTimeout,
 *   onTimeout: () => void,
 *   onRemaining?: (seconds: number | null) => void,
 * }} options
 */
export function createKioskInactivityTimer(options) {
  const timeoutMs = options.timeoutMs ?? KIOSK_INACTIVITY_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  const onTimeout = options.onTimeout;
  const onRemaining = options.onRemaining;

  let armed = false;
  let lastActivityAt = now();
  let fireTimerId = null;
  let tickTimerId = null;

  function clearTimers() {
    if (fireTimerId != null) {
      clearTimeoutFn(fireTimerId);
      fireTimerId = null;
    }
    if (tickTimerId != null) {
      clearTimeoutFn(tickTimerId);
      tickTimerId = null;
    }
  }

  function emitRemaining() {
    if (!armed) {
      onRemaining?.(null);
      return;
    }
    onRemaining?.(remainingInactivitySeconds({ lastActivityAt, now: now(), timeoutMs }));
  }

  function fire() {
    if (!armed) return;
    clearTimers();
    onRemaining?.(null);
    onTimeout();
  }

  function schedule() {
    clearTimers();
    if (!armed) {
      onRemaining?.(null);
      return;
    }
    emitRemaining();
    const remainingMs = timeoutMs - (now() - lastActivityAt);
    if (remainingMs <= 0) {
      fire();
      return;
    }
    fireTimerId = setTimeoutFn(() => fire(), remainingMs);
    const tick = () => {
      if (!armed) return;
      emitRemaining();
      tickTimerId = setTimeoutFn(tick, 1000);
    };
    tickTimerId = setTimeoutFn(tick, 1000);
  }

  return {
    setArmed(next) {
      const wasArmed = armed;
      armed = Boolean(next);
      if (!armed) {
        clearTimers();
        onRemaining?.(null);
        return;
      }
      if (!wasArmed) {
        lastActivityAt = now();
      }
      schedule();
    },
    noteActivity() {
      if (!armed) return;
      lastActivityAt = now();
      schedule();
    },
    getLastActivityAt() {
      return lastActivityAt;
    },
    isArmed() {
      return armed;
    },
    dispose() {
      armed = false;
      clearTimers();
      onRemaining?.(null);
    },
  };
}
