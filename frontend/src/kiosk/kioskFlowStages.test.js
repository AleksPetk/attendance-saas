import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHOTO_CAPABLE_CARD_TEMPLATE_IDS } from "./kioskPersonInitials.js";

const root = dirname(fileURLToPath(import.meta.url));
const groupKioskSrc = readFileSync(join(root, "../GroupKioskScreen.jsx"), "utf8");
const flowStagesCss = readFileSync(join(root, "kioskFlowStages.css"), "utf8");
const summarySrc = readFileSync(join(root, "KioskParticipantSummary.jsx"), "utf8");
const processingViewSrc = readFileSync(join(root, "KioskProcessingView.jsx"), "utf8");
const confirmationViewSrc = readFileSync(join(root, "KioskConfirmationView.jsx"), "utf8");
const cardCss = readFileSync(join(root, "cardTemplates.css"), "utf8");
const avatarSrc = readFileSync(join(root, "kioskParticipantAvatar.jsx"), "utf8");

test("A: selection screen keeps large photo avatar styling", () => {
  assert.match(cardCss, /data-card-template="photo"[\s\S]*?width:\s*5\.75rem/);
  assert.match(cardCss, /data-card-template="polaroid"[\s\S]*?aspect-ratio:\s*1/);
});

test("B: Choose Action uses compact summary not full selection card", () => {
  assert.match(groupKioskSrc, /kiosk-flow--action/);
  assert.match(groupKioskSrc, /KioskParticipantSummary/);
  assert.doesNotMatch(groupKioskSrc, /PhotoThumb/);
  assert.match(summarySrc, /size="compact"/);
});

test("C: Processing uses compact participant summary", () => {
  assert.match(processingViewSrc, /KioskParticipantSummary/);
  assert.match(groupKioskSrc, /photoUrl=\{selected\?\.photo_url\}/);
});

test("D: Confirmation does not inherit selection-card dimensions", () => {
  assert.doesNotMatch(confirmationViewSrc, /kiosk-person-card/);
  assert.doesNotMatch(confirmationViewSrc, /KioskPersonAvatar/);
  assert.match(confirmationViewSrc, /kc-unified-panel/);
});

test("E: compact avatar supports member photo URL", () => {
  assert.match(summarySrc, /photoUrl=\{photoUrl\}/);
  assert.match(avatarSrc, /size === "compact"/);
  assert.match(flowStagesCss, /kiosk-person-avatar--compact/);
});

test("F: compact avatar uses initials fallback path", () => {
  assert.match(summarySrc, /KioskPersonAvatar/);
  assert.match(avatarSrc, /kiosk-person-initials/);
});

test("G: visitor photoUrl null still renders summary", () => {
  assert.match(groupKioskSrc, /photo_url: p\.photo_url/);
});

test("H: image error fallback preserved on compact avatar", () => {
  assert.match(avatarSrc, /onError=\{\(\) => setImageFailed\(true\)\}/);
});

test("I: action stage suppresses flow decorative pseudo-elements", () => {
  assert.match(flowStagesCss, /kiosk-flow--action::before[\s\S]*?content:\s*none/);
  assert.match(flowStagesCss, /kiosk-flow--action::after[\s\S]*?content:\s*none/);
});

test("J: identify forms keep decorative flow variant class", () => {
  assert.match(groupKioskSrc, /kiosk-flow--identify/);
});

test("K: photo-capable families have compact summary styling hooks", () => {
  for (const id of PHOTO_CAPABLE_CARD_TEMPLATE_IDS) {
    assert.match(
      flowStagesCss,
      new RegExp(`data-flow-template="${id}"`),
      `${id} compact flow styling`,
    );
  }
});

test("L: photo_url propagated through card tap and identify", () => {
  assert.match(groupKioskSrc, /photo_url: p\.photo_url/);
  assert.match(groupKioskSrc, /photo_url: result\.data\.participant\.photo_url/);
});
