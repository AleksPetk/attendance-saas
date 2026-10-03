import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  createKioskInactivityTimer,
  hasNonEmptyKioskInput,
  KIOSK_INACTIVITY_TIMEOUT_MS,
  remainingInactivitySeconds,
  shouldArmKioskInactivity,
} from "./kioskInactivityTimeout";

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
  const timers = new Map<number, { due: number; fn: () => void }>();

  return {
    now: () => now,
    setTimeoutFn(fn: () => void, delay?: number) {
      const id = nextId++;
      timers.set(id, { due: now + Number(delay || 0), fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn(id: ReturnType<typeof setTimeout>) {
      timers.delete(id as unknown as number);
    },
    tick(ms: number) {
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
  let timer: ReturnType<typeof createKioskInactivityTimer> | null = null;

  afterEach(() => {
    timer?.dispose();
    timer = null;
  });

  it("keeps participant state active before 30s and resets after idle timeout", () => {
    const clock = createFakeClock();
    let timedOut = false;
    let remaining: number | null = null;
    timer = createKioskInactivityTimer({
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn as typeof setTimeout,
      clearTimeoutFn: clock.clearTimeoutFn as typeof clearTimeout,
      onTimeout: () => {
        timedOut = true;
      },
      onRemaining: (value) => {
        remaining = value;
      },
    });

    timer.setArmed(true);
    assert.equal(timer.isArmed(), true);
    assert.equal(remaining, 30);

    clock.tick(29_000);
    assert.equal(timedOut, false);
    assert.equal(remaining, 1);

    timer.noteActivity();
    assert.equal(remaining, 30);

    clock.tick(30_000);
    assert.equal(timedOut, true);
    assert.equal(remaining, null);
  });

  it("does not fire while disarmed for busy perform / success / exit", () => {
    const clock = createFakeClock();
    let timedOut = false;
    timer = createKioskInactivityTimer({
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn as typeof setTimeout,
      clearTimeoutFn: clock.clearTimeoutFn as typeof clearTimeout,
      onTimeout: () => {
        timedOut = true;
      },
    });

    timer.setArmed(true);
    clock.tick(20_000);
    timer.setArmed(false);
    clock.tick(20_000);
    assert.equal(timedOut, false);

    timer.setArmed(false);
    clock.tick(40_000);
    assert.equal(timedOut, false);
  });

  it("re-arms with a fresh window after busy interaction ends", () => {
    const clock = createFakeClock();
    let timedOut = false;
    timer = createKioskInactivityTimer({
      now: clock.now,
      setTimeoutFn: clock.setTimeoutFn as typeof setTimeout,
      clearTimeoutFn: clock.clearTimeoutFn as typeof clearTimeout,
      onTimeout: () => {
        timedOut = true;
      },
    });

    timer.setArmed(true);
    clock.tick(25_000);
    timer.setArmed(false);
    clock.tick(10_000);
    timer.setArmed(true);
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
      setTimeoutFn: clock.setTimeoutFn as typeof setTimeout,
      clearTimeoutFn: clock.clearTimeoutFn as typeof clearTimeout,
      onTimeout: () => {
        timedOut = true;
      },
    });
    timer.noteActivity();
    clock.tick(40_000);
    assert.equal(timedOut, false);
  });
});
