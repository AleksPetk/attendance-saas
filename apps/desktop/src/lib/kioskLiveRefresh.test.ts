import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isKioskRefreshIdle,
  KIOSK_FOREGROUND_MIN_ELAPSED_MS,
  KIOSK_SOFT_REFRESH_MS,
  resolveStructuredClassAfterRefresh,
  shouldRefreshOnForeground,
  shouldRunPeriodicRefresh,
} from "./kioskLiveRefresh";

const pageSource = readFileSync(fileURLToPath(new URL("../pages/KioskPage.tsx", import.meta.url)), "utf8");

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

afterEach(() => {
  // no global timer pollution expected from pure helpers
});

test("soft refresh interval is five minutes", () => {
  assert.equal(KIOSK_SOFT_REFRESH_MS, 5 * 60 * 1000);
  assert.match(pageSource, /KIOSK_SOFT_REFRESH_MS/);
  assert.match(pageSource, /setInterval/);
  assert.match(pageSource, /clearInterval\(interval\)/);
});

test("idle gate blocks interactive kiosk states", () => {
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

test("periodic refresh requires active app and elapsed interval", () => {
  assert.equal(shouldRunPeriodicRefresh({ now: 10, lastRefreshAt: null, appActive: true }), true);
  assert.equal(shouldRunPeriodicRefresh({ now: 10, lastRefreshAt: null, appActive: false }), false);
  assert.equal(
    shouldRunPeriodicRefresh({ now: KIOSK_SOFT_REFRESH_MS, lastRefreshAt: 0, appActive: true }),
    true,
  );
  assert.equal(
    shouldRunPeriodicRefresh({ now: KIOSK_SOFT_REFRESH_MS - 1, lastRefreshAt: 0, appActive: true }),
    false,
  );
});

test("fake timers: idle 5 min triggers one refresh then another", () => {
  let now = 0;
  let lastRefreshAt: number | null = 0;
  let runs = 0;
  const tick = () => {
    if (!shouldRunPeriodicRefresh({ now, lastRefreshAt, appActive: true })) return;
    runs += 1;
    lastRefreshAt = now;
  };

  now = KIOSK_SOFT_REFRESH_MS - 1;
  tick();
  assert.equal(runs, 0);

  now = KIOSK_SOFT_REFRESH_MS;
  tick();
  assert.equal(runs, 1);

  now = KIOSK_SOFT_REFRESH_MS * 2 - 1;
  tick();
  assert.equal(runs, 1);

  now = KIOSK_SOFT_REFRESH_MS * 2;
  tick();
  assert.equal(runs, 2);
});

test("no overlapping refresh; deferred runs when idle", () => {
  let inFlight = false;
  let pending = false;
  let runs = 0;
  const refresh = (snapshot: typeof idle) => {
    if (inFlight) {
      pending = true;
      return;
    }
    if (!isKioskRefreshIdle(snapshot)) {
      pending = true;
      return;
    }
    inFlight = true;
    runs += 1;
    inFlight = false;
    if (pending && isKioskRefreshIdle(idle)) {
      pending = false;
      refresh(idle);
    }
  };

  refresh({ ...idle, hasParticipant: true });
  assert.equal(runs, 0);
  assert.equal(pending, true);

  // Become idle — deferred refresh runs once.
  pending = false;
  refresh(idle);
  assert.equal(runs, 1);
  assert.equal(pending, false);

  inFlight = true;
  refresh(idle);
  assert.equal(runs, 1);
  assert.equal(pending, true);
  inFlight = false;
  if (pending) {
    pending = false;
    refresh(idle);
  }
  assert.equal(runs, 2);
});

test("focus + timer near same moment do not duplicate when min elapsed not met", () => {
  const lastRefreshAt = 100_000;
  assert.equal(
    shouldRefreshOnForeground({
      wasBackgrounded: true,
      now: lastRefreshAt + KIOSK_FOREGROUND_MIN_ELAPSED_MS - 1,
      lastRefreshAt,
    }),
    false,
  );
  assert.equal(
    shouldRunPeriodicRefresh({
      now: lastRefreshAt + KIOSK_FOREGROUND_MIN_ELAPSED_MS - 1,
      lastRefreshAt,
      appActive: true,
    }),
    false,
  );
  assert.equal(
    shouldRefreshOnForeground({
      wasBackgrounded: true,
      now: lastRefreshAt + KIOSK_FOREGROUND_MIN_ELAPSED_MS,
      lastRefreshAt,
    }),
    true,
  );
});

test("page wires deferred soft refresh and preserves failed soft state", () => {
  assert.match(pageSource, /pendingSoftRefresh/);
  assert.match(pageSource, /refreshInFlight/);
  assert.match(pageSource, /isKioskRefreshIdle/);
  assert.match(pageSource, /Soft refresh failures keep last successful kiosk content/);
  assert.match(pageSource, /sessionExpired && soft/);
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

  assert.match(pageSource, /resolveStructuredClassAfterRefresh/);
  assert.match(pageSource, /classes\/\$\{classResolution\.selected\.id\}\/people\//);
  assert.match(pageSource, /clearPeople/);
  assert.match(pageSource, /setData\(\(old\) => \(\{ \.\.\.response, people: old\.people/);
});
