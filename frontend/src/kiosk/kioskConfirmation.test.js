/**
 * Run: node --test src/kiosk/kioskConfirmation.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderConfirmationMessage, CONFIRMATION_TEMPLATE_IDS, normalizeConfirmationTemplate } from "./kioskConfirmation.js";
import {
  confirmationAccentStyleFromDesign,
  confirmationAccentStyleFromHeader,
  headerBackgroundGradient,
  headerBackgroundPrimaryColor,
} from "./kioskConfirmationAccent.js";
import {
  playConfirmationTone,
  primeConfirmationAudio,
  shouldRunConfirmationEffects,
  vibrateConfirmation,
} from "./confirmationEffects.js";

test("renders name time group variables", () => {
  const message = renderConfirmationMessage("Hi {name}, {group} at {time}.", {
    name: "Aleks",
    group: "School",
    time: "21:42",
  });
  assert.equal(message, "Hi Aleks, School at 21:42.");
});

test("unknown variables are removed safely", () => {
  const message = renderConfirmationMessage("Hello {name} and {unknown}.", {
    name: "Aleks",
    group: "School",
    time: "21:42",
  });
  assert.equal(message, "Hello Aleks and .");
});

test("normalizeTemplate falls back to clean", () => {
  assert.equal(normalizeConfirmationTemplate("business"), "business");
  assert.equal(normalizeConfirmationTemplate("invalid"), "clean");
  assert.equal(normalizeConfirmationTemplate(""), "clean");
});

test("legacy confirmation registry remains for storage compat", () => {
  assert.equal(CONFIRMATION_TEMPLATE_IDS.length, 8);
  assert.deepEqual(CONFIRMATION_TEMPLATE_IDS, [
    "clean",
    "business",
    "friendly",
    "kids",
    "fitness",
    "event",
    "celebration",
    "minimal",
  ]);
});

test("header solid accent derives primary color", () => {
  const color = headerBackgroundPrimaryColor({ color: "#EC4899" }, "#2563EB");
  assert.equal(color, "#EC4899");
  const style = confirmationAccentStyleFromHeader({ color: "#EC4899" });
  assert.equal(style["--kc-accent"], "#EC4899");
  assert.equal(style["--kc-accent-gradient"], "#EC4899");
  assert.equal(style["--kc-accent-mode"], "solid");
});

test("header gradient accent preserves gradient string", () => {
  const background = {
    mode: "gradient",
    color: "#EC4899",
    color2: "#8B5CF6",
    gradient_angle: 135,
  };
  const gradient = headerBackgroundGradient(background);
  assert.equal(gradient, "linear-gradient(135deg, #EC4899, #8B5CF6)");
  const style = confirmationAccentStyleFromHeader(background);
  assert.equal(style["--kc-accent"], "#EC4899");
  assert.equal(style["--kc-accent-2"], "#8B5CF6");
  assert.equal(style["--kc-accent-gradient"], gradient);
  assert.equal(style["--kc-accent-mode"], "gradient");
});

test("missing header falls back to input template accent", () => {
  const style = confirmationAccentStyleFromDesign({
    main: { input_template: "dark" },
  });
  assert.equal(style["--kc-accent"], "#38BDF8");
  assert.equal(style["--kc-accent-mode"], "solid");
});

test("missing design config uses safe fallback accent", () => {
  const style = confirmationAccentStyleFromDesign(null);
  assert.equal(style["--kc-accent"], "#2563EB");
  assert.equal(style["--kc-accent-gradient"], "#2563EB");
});

function fakeAudioContext() {
  const calls = { start: 0, stop: 0, connect: 0, resume: 0 };
  const context = {
    state: "running",
    currentTime: 10,
    destination: {},
    resume: async () => {
      calls.resume += 1;
      context.state = "running";
    },
    createOscillator: () => ({
      type: "",
      frequency: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() { calls.connect += 1; },
      start() { calls.start += 1; },
      stop() { calls.stop += 1; },
    }),
    createGain: () => ({
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() { calls.connect += 1; },
    }),
  };
  return { context, calls };
}

test("disabled sound creates no tone", async () => {
  const { context, calls } = fakeAudioContext();
  assert.equal(await playConfirmationTone({ enabled: false, audioContext: context }), false);
  assert.equal(calls.start, 0);
});

test("enabled sound plays one short synthesized tone", async () => {
  const { context, calls } = fakeAudioContext();
  assert.equal(await playConfirmationTone({ enabled: true, audioContext: context }), true);
  assert.equal(calls.start, 1);
  assert.equal(calls.stop, 1);
});

test("audio preparation does not play a tone on action press", () => {
  let createdContext;
  class FakeAudioContext {
    constructor() {
      const fake = fakeAudioContext();
      createdContext = fake;
      return fake.context;
    }
  }
  assert.equal(primeConfirmationAudio({
    enabled: true,
    globalObject: { AudioContext: FakeAudioContext },
  }), true);
  assert.equal(createdContext.calls.start, 0);
});

test("vibration respects enablement and browser capability", () => {
  let calls = 0;
  const navigatorObject = { vibrate: (duration) => {
    calls += 1;
    assert.equal(duration, 45);
    return true;
  } };
  assert.equal(vibrateConfirmation({ enabled: false, navigatorObject }), false);
  assert.equal(vibrateConfirmation({ enabled: true, navigatorObject: {} }), false);
  assert.equal(vibrateConfirmation({ enabled: true, navigatorObject }), true);
  assert.equal(calls, 1);
});

test("confirmation effects run once only for a newly visible success", () => {
  const confirmation = { presentation_id: 7 };
  let lastPresentationId = null;
  let effectCount = 0;
  for (const step of ["processing", "confirm", "success", "success"]) {
    if (shouldRunConfirmationEffects({ step, confirmation, lastPresentationId })) {
      lastPresentationId = confirmation.presentation_id;
      effectCount += 1;
    }
  }
  assert.equal(effectCount, 1);
  assert.equal(shouldRunConfirmationEffects({
    step: "confirm",
    confirmation: null,
    lastPresentationId,
  }), false);
});
