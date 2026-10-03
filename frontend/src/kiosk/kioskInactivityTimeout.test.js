import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  createKioskInactivityTimer,
  hasNonEmptyKioskInput,
  KIOSK_INACTIVITY_TIMEOUT_MS,
  remainingInactivitySeconds,
  shouldArmKioskInactivity,
} from "./kioskInactivityTimeout.js";

const baseArm = {
  participantSensitive: true,
  interactionBusy: false,
  successVisible: false,
  exitOpen: false,
  sessionExpired: false,
  loading: false,
};

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  /** @type {Map<number, { due: number, fn: () => void }>} */
  const timers = new Map();

  return {
    now: () => now,
    setTimeoutFn(fn, delay) {
      const id = nextId++;
      timers.set(id, { due: now + Number(delay || 0), fn });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    tick(ms) {
      now += ms;
      let progressed = true;
      while (progressed) {
        progressed = false;
        const due = [...timers.entries()]
          .filter(([, entry]) => entry.due <= now)
          .sort((a, b) => a[1].due - b[1].due);
        for (const [id, entry] of due) {
          if (!timers.has(id)) continue;
          timers.delete(id);
          entry.fn();
          progressed = true;
        }
      }
    },
  };
}

describe("kiosk inactivity policy", () => {
  it("uses a 30 second timeout", () => {
    assert.equal(KIOSK_INACTIVITY_TIMEOUT_MS, 30_000);
  });

  it("arms only for participant-sensitive idle interaction", () => {
    assert.equal(shouldArmKioskInactivity(baseArm), true);
    assert.equal(shouldArmKioskInactivity({ ...baseArm, participantSensitive: false }), false);
    assert.equal(shouldArmKioskInactivity({ ...baseArm, interactionBusy: true }), false);
    assert.equal(shouldArmKioskInactivity({ ...baseArm, successVisible: true }), false);
    assert.equal(shouldArmKioskInactivity({ ...baseArm, exitOpen: true }), false);
    assert.equal(shouldArmKioskInactivity({ ...baseArm, sessionExpired: true }), false);
    assert.equal(shouldArmKioskInactivity({ ...baseArm, loading: true }), false);
  });

  it("detects non-empty participant input including PIN", () => {
    assert.equal(hasNonEmptyKioskInput({}), false);
    assert.equal(hasNonEmptyKioskInput({ name: "  " }), false);
    assert.equal(hasNonEmptyKioskInput({ pin: "1234" }), true);
    assert.equal(hasNonEmptyKioskInput({ name: "Ada", pin: "" }), true);
  });

  it("computes remaining seconds with ceil", () => {
    assert.equal(remainingInactivitySeconds({ lastActivityAt: 0, now: 0 }), 30);
    assert.equal(remainingInactivitySeconds({ lastActivityAt: 0, now: 29_001 }), 1);
    assert.equal(remainingInactivitySeconds({ lastActivityAt: 0, now: 30_000 }), 0);
  });
});

describe("kiosk inactivity timer", () => {
  /** @type {ReturnType<typeof createKioskInactivityTimer> | null} */
  let timer = null;

  afterEach(() => {
    timer?.dispose();
    timer = null;
  });

  it("keeps participant state active before 30s and resets after idle timeout", () => {
    const clock = createFakeClock();
    let timedOut = false;
    /** @type {number | null} */
    let remaining = null;
    timer = createKioskInactivityTimer({
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      onTimeout: () => {
        timedOut = true;
      },
      onRemaining: (value) => {
        remaining = value;
      },
    });

    // 1) participant selected / PIN / choose-action → arm
    timer.setArmed(true);
    assert.equal(timer.isArmed(), true);
    assert.equal(remaining, 30);

    // 2) advance 29s → still active
    clock.tick(29_000);
    assert.equal(timedOut, false);
    assert.equal(remaining, 1);

    // 3) meaningful activity → timer resets
    timer.noteActivity();
    assert.equal(remaining, 30);

    // 4–6) advance 30s idle → timeout (caller clears PIN/participant)
    clock.tick(30_000);
    assert.equal(timedOut, true);
    assert.equal(remaining, null);
  });

  it("does not fire while disarmed for busy perform / success / exit", () => {
    const clock = createFakeClock();
    let timedOut = false;
    timer = createKioskInactivityTimer({
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      onTimeout: () => {
        timedOut = true;
      },
    });

    timer.setArmed(true);
    clock.tick(20_000);
    // processing / perform in flight → disarm (defer)
    timer.setArmed(false);
    clock.tick(20_000);
    assert.equal(timedOut, false);

    // exit PIN / success also stay disarmed
    timer.setArmed(false);
    clock.tick(40_000);
    assert.equal(timedOut, false);
  });

  it("re-arms with a fresh window after busy interaction ends", () => {
    const clock = createFakeClock();
    let timedOut = false;
    timer = createKioskInactivityTimer({
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      onTimeout: () => {
        timedOut = true;
      },
    });

    timer.setArmed(true);
    clock.tick(25_000);
    timer.setArmed(false); // perform starts
    clock.tick(10_000);
    timer.setArmed(true); // perform failed, back to choose-action
    clock.tick(29_000);
    assert.equal(timedOut, false);
    clock.tick(1_000);
    assert.equal(timedOut, true);
  });

  it("ignores activity while disarmed (idle start / exit flow)", () => {
    const clock = createFakeClock();
    let timedOut = false;
    timer = createKioskInactivityTimer({
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      onTimeout: () => {
        timedOut = true;
      },
    });
    timer.noteActivity();
    clock.tick(40_000);
    assert.equal(timedOut, false);
  });
});
