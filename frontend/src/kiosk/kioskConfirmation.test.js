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
