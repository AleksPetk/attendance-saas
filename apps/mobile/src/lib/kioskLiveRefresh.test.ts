import assert from "node:assert/strict";
import test from "node:test";
import {
  isKioskRefreshIdle,
  KIOSK_FOREGROUND_MIN_ELAPSED_MS,
  KIOSK_SOFT_REFRESH_MS,
  resolveStructuredClassAfterRefresh,
  shouldRefreshOnForeground,
  shouldRunPeriodicRefresh,
} from "./kioskLiveRefresh";

const idle = {
  busy: false,
  performLocked: false,
  hasParticipant: false,
  hasPendingPerson: false,
  hasSuccessMessage: false,
  showExit: false,
  classPinBusy: false,
  sessionExpired: false,
  refreshInFlight: false,
};

test("soft refresh interval is five minutes", () => {
  assert.equal(KIOSK_SOFT_REFRESH_MS, 5 * 60 * 1000);
});

test("idle gate blocks active attendance interactions", () => {
  assert.equal(isKioskRefreshIdle(idle), true);
  assert.equal(isKioskRefreshIdle({ ...idle, busy: true }), false);
  assert.equal(isKioskRefreshIdle({ ...idle, performLocked: true }), false);
  assert.equal(isKioskRefreshIdle({ ...idle, hasParticipant: true }), false);
  assert.equal(isKioskRefreshIdle({ ...idle, hasPendingPerson: true }), false);
  assert.equal(isKioskRefreshIdle({ ...idle, hasSuccessMessage: true }), false);
  assert.equal(isKioskRefreshIdle({ ...idle, showExit: true }), false);
  assert.equal(isKioskRefreshIdle({ ...idle, classPinBusy: true }), false);
  assert.equal(isKioskRefreshIdle({ ...idle, sessionExpired: true }), false);
  assert.equal(isKioskRefreshIdle({ ...idle, refreshInFlight: true }), false);
});

test("foreground refresh uses wall-clock elapsed time after backgrounding", () => {
  assert.equal(
    shouldRefreshOnForeground({
      wasBackgrounded: false,
      now: 100_000,
      lastRefreshAt: 0,
    }),
    false,
  );
  assert.equal(
    shouldRefreshOnForeground({
      wasBackgrounded: true,
      now: 100_000,
      lastRefreshAt: null,
    }),
    true,
  );
  assert.equal(
    shouldRefreshOnForeground({
      wasBackgrounded: true,
      now: 100_000,
      lastRefreshAt: 100_000 - (KIOSK_FOREGROUND_MIN_ELAPSED_MS - 1),
    }),
    false,
  );
  assert.equal(
    shouldRefreshOnForeground({
      wasBackgrounded: true,
      now: 100_000,
      lastRefreshAt: 100_000 - KIOSK_FOREGROUND_MIN_ELAPSED_MS,
    }),
    true,
  );
  assert.equal(
    shouldRefreshOnForeground({
      wasBackgrounded: true,
      now: 100_000,
      lastRefreshAt: 100_000 - 8 * 60 * 60 * 1000,
    }),
    true,
  );
});

test("periodic refresh requires active app and elapsed interval", () => {
  assert.equal(
    shouldRunPeriodicRefresh({ now: 10, lastRefreshAt: null, appActive: true }),
    true,
  );
  assert.equal(
    shouldRunPeriodicRefresh({ now: 10, lastRefreshAt: null, appActive: false }),
    false,
  );
  assert.equal(
    shouldRunPeriodicRefresh({
      now: KIOSK_SOFT_REFRESH_MS,
      lastRefreshAt: 0,
      appActive: true,
    }),
    true,
  );
  assert.equal(
    shouldRunPeriodicRefresh({
      now: KIOSK_SOFT_REFRESH_MS - 1,
      lastRefreshAt: 0,
      appActive: true,
    }),
    false,
  );
});

test("structured class refresh keeps valid selection and clears missing class", () => {
  const classes = [
    { id: 1, name: "A" },
    { id: 2, name: "B" },
  ];
  assert.deepEqual(
    resolveStructuredClassAfterRefresh({ id: 2, name: "B" }, classes),
    { selected: { id: 2, name: "B" }, classReady: true, clearPeople: false },
  );
  assert.deepEqual(
    resolveStructuredClassAfterRefresh({ id: 9, name: "Gone" }, classes),
    { selected: null, classReady: false, clearPeople: true },
  );
  assert.deepEqual(
    resolveStructuredClassAfterRefresh(null, classes),
    { selected: null, classReady: false, clearPeople: true },
  );
});

test("deferred refresh runs after idle when previously blocked", () => {
  let pending = false;
  let runs = 0;
  const tryRefresh = (snapshot: typeof idle) => {
    if (!isKioskRefreshIdle(snapshot)) {
      pending = true;
      return;
    }
    runs += 1;
    pending = false;
  };
  tryRefresh({ ...idle, hasParticipant: true });
  assert.equal(runs, 0);
  assert.equal(pending, true);
  if (pending && isKioskRefreshIdle(idle)) tryRefresh(idle);
  assert.equal(runs, 1);
  assert.equal(pending, false);
});

test("overlapping refresh is skipped while one is in flight", () => {
  let inFlight = false;
  let pending = false;
  let runs = 0;
  const refresh = () => {
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    runs += 1;
    inFlight = false;
    if (pending) {
      pending = false;
      refresh();
    }
  };
  inFlight = true;
  refresh();
  assert.equal(runs, 0);
  assert.equal(pending, true);
  inFlight = false;
  if (pending) {
    pending = false;
    refresh();
  }
  assert.equal(runs, 1);
});
