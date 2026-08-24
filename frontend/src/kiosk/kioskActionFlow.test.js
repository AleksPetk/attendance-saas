/**
 * Kiosk action processing UX tests.
 * Run: node --test src/kiosk/kioskActionFlow.test.js
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CARD_TEMPLATE_IDS } from "./cardTemplates.js";
import { INPUT_TEMPLATE_IDS } from "./inputTemplates.js";
import { resolveFlowTemplate } from "./flowTemplate.js";
import { processingHeadline, normalizeProcessingVisualFamily } from "./kioskProcessing.js";
import { allConfirmationVisualFamilyIds } from "./kioskConfirmation.js";

const root = dirname(fileURLToPath(import.meta.url));
const groupKioskSrc = readFileSync(join(root, "../GroupKioskScreen.jsx"), "utf8");
const processingViewSrc = readFileSync(join(root, "KioskProcessingView.jsx"), "utf8");
const processingCss = readFileSync(join(root, "processingFlow.css"), "utf8");

const performActionBlock = groupKioskSrc.slice(
  groupKioskSrc.indexOf("async function performAction"),
  groupKioskSrc.indexOf("async function handleInputSubmit"),
);

test("A: click action → Processing renders immediately via flushSync", () => {
  assert.match(performActionBlock, /flushSync\s*\(/);
  assert.match(performActionBlock, /setStep\("processing"\)/);
  assert.match(performActionBlock, /setPendingAction\(action\)/);
  assert.match(groupKioskSrc, /from "react-dom"/);
});

test("B: Choose Action content is not rendered while pending", () => {
  assert.match(
    groupKioskSrc,
    /step !== "processing"[\s\S]*ParticipantActionPanel|ParticipantActionPanel[\s\S]*step !== "processing"/,
  );
  assert.match(
    groupKioskSrc,
    /!unavailable && step === "processing"[\s\S]*processingPanel\(\)/,
  );
  // Processing is a dedicated top-level branch, not nested inside confirm panel.
  assert.doesNotMatch(
    groupKioskSrc,
    /ParticipantActionPanel[\s\S]{0,400}step === "processing"/,
  );
  assert.match(groupKioskSrc, /kiosk-flow--action/);
});

test("C: Processing uses selected template family", () => {
  assert.match(processingViewSrc, /data-kp-family/);
  assert.match(processingViewSrc, /normalizeProcessingVisualFamily/);
  assert.match(groupKioskSrc, /template=\{confirmationVisualFamily\}/);
  assert.match(groupKioskSrc, /KioskProcessingScreen/);
});

test("D: success → Confirmation", () => {
  assert.match(performActionBlock, /setStep\("success"\)/);
  assert.match(groupKioskSrc, /step === "success" \? successPanel\(\)/);
});

test("E: failure → error / no success confirmation", () => {
  assert.match(performActionBlock, /catch \(err\)[\s\S]*setStep\("confirm"\)/);
  assert.doesNotMatch(performActionBlock, /catch \(err\)[\s\S]*setStep\("success"\)/);
});

test("F: double submit impossible while Processing", () => {
  assert.match(performActionBlock, /performingRef\.current/);
  assert.match(
    performActionBlock,
    /if \(!selected \|\| performingRef\.current \|\| step === "processing"\) return/,
  );
  assert.match(groupKioskSrc, /backToParticipants[\s\S]*step === "processing"\) return/);
});

test("G: confirmation timer starts after confirmation appears", () => {
  assert.match(performActionBlock, /setStep\("success"\)[\s\S]*scheduleReturnToStart/);
  assert.doesNotMatch(performActionBlock, /catch \(err\)[\s\S]*scheduleReturnToStart/);
  assert.doesNotMatch(
    performActionBlock,
    /flushSync[\s\S]*scheduleReturnToStart[\s\S]*await api\.performKioskAction/,
  );
});

test("I: representative templates resolve processing designs", () => {
  for (const id of ["terminal", "kids_bubble", "executive", "cyber_hex", "ticket", "comic", "heart_pop"]) {
    assert.equal(normalizeProcessingVisualFamily(id), id);
    assert.match(processingCss, new RegExp(`data-kp-family="${id}"`));
  }
});

test("action-aware processing copy", () => {
  assert.equal(processingHeadline("check_in", "Nami"), "Checking in Nami…");
  assert.equal(processingHeadline("check_out"), "Checking out…");
  assert.equal(processingHeadline("break_start", "Pat"), "Starting break Pat…");
  assert.equal(processingHeadline("break_end"), "Ending break…");
});

test("every Card/Input family has processing CSS hook", () => {
  for (const id of allConfirmationVisualFamilyIds()) {
    assert.equal(normalizeProcessingVisualFamily(id), id);
  }
  assert.match(processingCss, /\.kiosk-processing--unified/);
  assert.match(processingCss, /prefers-reduced-motion/);
  assert.match(processingCss, /kp-spinner-ring|kp-spin/);
});

test("Card vs Input flow template resolution for processing", () => {
  const main = { card_template: "terminal", input_template: "kids_bubble" };
  assert.equal(resolveFlowTemplate(main, "card"), "terminal");
  assert.equal(resolveFlowTemplate(main, "input"), "kids_bubble");
});

test("all template ids are known card or input keys", () => {
  for (const id of CARD_TEMPLATE_IDS) {
    assert.doesNotThrow(() => normalizeProcessingVisualFamily(id));
  }
  for (const id of INPUT_TEMPLATE_IDS) {
    assert.doesNotThrow(() => normalizeProcessingVisualFamily(id));
  }
});
