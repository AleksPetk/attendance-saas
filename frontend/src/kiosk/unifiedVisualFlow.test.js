/**
 * Stage 2 — unified visual template flow tests.
 * Run: node --test src/kiosk/unifiedVisualFlow.test.js
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CARD_TEMPLATE_IDS } from "./cardTemplates.js";
import { INPUT_TEMPLATE_IDS } from "./inputTemplates.js";
import { resolveFlowTemplate } from "./flowTemplate.js";
import {
  allConfirmationVisualFamilyIds,
  CONFIRMATION_TEMPLATE_IDS,
  isConfirmationVisualFamily,
  LEGACY_CONFIRMATION_TEMPLATE_IDS,
  normalizeConfirmationTemplate,
  normalizeConfirmationVisualFamily,
  resolveConfirmationVisualFamily,
  renderConfirmationMessage,
} from "./kioskConfirmation.js";
import {
  isKioskSettingsDirty,
  EMPTY_KIOSK_SETTINGS_FORM,
  buildKioskSettingsSavePayload,
  normalizeKioskSettingsComparable,
} from "./kioskSettingsForm.js";

const root = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(root, "KioskConfirmationSettings.jsx"), "utf8");
const settingsScreenSrc = readFileSync(join(root, "KioskSettingsScreen.jsx"), "utf8");
const confirmationViewSrc = readFileSync(join(root, "KioskConfirmationView.jsx"), "utf8");
const confirmationCss = readFileSync(join(root, "confirmationFlow.css"), "utf8");
const groupKioskSrc = readFileSync(join(root, "../GroupKioskScreen.jsx"), "utf8");

const configuredUi = {
  changingExitCode: false,
  savedChangingExitCode: false,
  exitCodeConfigured: true,
};

test("A: Confirmation Template selector no longer renders in Kiosk Settings", () => {
  assert.doesNotMatch(settingsSrc, /confirmation-template/);
  assert.doesNotMatch(settingsSrc, /kc-template-picker/);
  assert.doesNotMatch(settingsSrc, /CONFIRMATION_TEMPLATES/);
  assert.doesNotMatch(settingsSrc, /title="Template"/);
  assert.doesNotMatch(settingsSrc, /id="template"/);
  assert.match(settingsSrc, /confirmation\.messages\.title/);
  assert.match(settingsSrc, /confirmation\.return\.title/);
  assert.match(settingsSrc, /confirmation\.effects\.title/);
  assert.match(settingsScreenSrc, /settings\.confirmationScreen\.title/);
});

test("B/C: Messages and Return time still present", () => {
  assert.match(settingsSrc, /confirmation_return_seconds/);
  assert.match(settingsSrc, /confirmation_check_in_message|item\.field/);
  assert.match(settingsSrc, /confirmation\.messages\.variablesTitle/);
  assert.match(settingsSrc, /\{name\}/);
});

test("Confirmation effects reuse the existing accordion and toggle controls", () => {
  assert.match(settingsSrc, /id="effects"/);
  assert.match(settingsSrc, /confirmation\.effects\.sound/);
  assert.match(settingsSrc, /confirmation\.effects\.vibration/);
  assert.match(settingsSrc, /<Toggle/);
  assert.match(settingsSrc, /confirmation\.effects\.browserNote/);
});

test("D: old confirmation-template config does not override Card/Input template", () => {
  const main = {
    card_template: "heart_pop",
    input_template: "terminal",
  };
  assert.equal(resolveConfirmationVisualFamily(main, "card"), "heart_pop");
  assert.equal(resolveConfirmationVisualFamily(main, "input"), "terminal");
  assert.equal(resolveFlowTemplate(main, "card"), "heart_pop");
  // Legacy settings value must not win.
  assert.notEqual(resolveConfirmationVisualFamily(main, "card"), "business");
});

test("E: legacy confirmation_template still loadable / normalizable", () => {
  for (const id of LEGACY_CONFIRMATION_TEMPLATE_IDS) {
    assert.equal(normalizeConfirmationTemplate(id), id);
  }
  assert.equal(normalizeConfirmationTemplate("neon_party"), "clean");
  assert.equal(CONFIRMATION_TEMPLATE_IDS.length, 8);
});

test("legacy confirmation ids map to visual families without crashing", () => {
  assert.equal(normalizeConfirmationVisualFamily("friendly"), "welcome");
  assert.equal(normalizeConfirmationVisualFamily("kids"), "playground");
  assert.equal(normalizeConfirmationVisualFamily("fitness"), "active");
  assert.equal(normalizeConfirmationVisualFamily("event"), "pass");
  assert.equal(normalizeConfirmationVisualFamily("celebration"), "victory");
  assert.equal(normalizeConfirmationVisualFamily("heart_pop"), "heart_pop");
});

test("confirmation_template change no longer marks Kiosk Settings dirty", () => {
  const saved = { ...EMPTY_KIOSK_SETTINGS_FORM };
  const draft = { ...saved, confirmation_template: "friendly" };
  assert.equal(isKioskSettingsDirty(draft, saved, configuredUi), false);
});

test("save payload omits confirmation_template", () => {
  const payload = buildKioskSettingsSavePayload(EMPTY_KIOSK_SETTINGS_FORM, configuredUi);
  assert.equal("confirmation_template" in payload, false);
  assert.ok("confirmation_return_seconds" in payload);
  assert.ok("confirmation_check_in_message" in payload);
});

test("dirty comparison ignores confirmation_template", () => {
  const a = normalizeKioskSettingsComparable(
    { ...EMPTY_KIOSK_SETTINGS_FORM, confirmation_template: "clean" },
    configuredUi,
  );
  const b = normalizeKioskSettingsComparable(
    { ...EMPTY_KIOSK_SETTINGS_FORM, confirmation_template: "friendly" },
    configuredUi,
  );
  assert.deepEqual(a, b);
});

test("live kiosk confirmation uses flow family, not API confirmation.template", () => {
  assert.match(groupKioskSrc, /resolveConfirmationVisualFamily/);
  assert.match(groupKioskSrc, /template=\{confirmationVisualFamily\}/);
  assert.doesNotMatch(
    groupKioskSrc,
    /template=\{confirmation\.template\}/,
  );
});

test("unified confirmation view uses data-kc-family", () => {
  assert.match(confirmationViewSrc, /data-kc-family=\{family\}/);
  assert.match(confirmationViewSrc, /kc-unified-panel/);
  assert.match(confirmationViewSrc, /normalizeConfirmationVisualFamily/);
  assert.doesNotMatch(confirmationViewSrc, /TEMPLATE_COMPONENTS/);
  assert.doesNotMatch(confirmationViewSrc, /kc-tpl-clean-card/);
});

test("every Card template key resolves confirmation theme", () => {
  for (const id of CARD_TEMPLATE_IDS) {
    assert.ok(isConfirmationVisualFamily(id), id);
    assert.equal(normalizeConfirmationVisualFamily(id), id);
    assert.equal(resolveConfirmationVisualFamily({ card_template: id }, "card"), id);
    assert.match(confirmationCss, new RegExp(`data-kc-family="${id}"|data-kc-family='${id}'|\\[data-kc-family="${id}"\\]`));
  }
});

test("every Input template key resolves confirmation theme", () => {
  for (const id of INPUT_TEMPLATE_IDS) {
    assert.ok(isConfirmationVisualFamily(id), id);
    assert.equal(resolveConfirmationVisualFamily({ input_template: id }, "input"), id);
  }
});

test("allConfirmationVisualFamilyIds covers Card + Input catalogs", () => {
  const all = allConfirmationVisualFamilyIds();
  assert.ok(all.length >= 28);
  for (const id of CARD_TEMPLATE_IDS) assert.ok(all.includes(id));
  for (const id of INPUT_TEMPLATE_IDS) assert.ok(all.includes(id));
});

test("representative Card flow families share one visual source", () => {
  for (const id of ["pure", "terminal", "kids_bubble", "playground", "ticket", "pass", "cyber_hex", "comic", "executive", "victory", "heart_pop"]) {
    const main = { card_template: id };
    assert.equal(resolveFlowTemplate(main, "card"), id);
    assert.equal(resolveConfirmationVisualFamily(main, "card"), id);
  }
});

test("representative Input flow families share one visual source", () => {
  for (const id of ["pure", "terminal", "kids_bubble", "cyber_hex", "ribbon", "executive", "clean"]) {
    const main = { input_template: id };
    assert.equal(resolveFlowTemplate(main, "input"), id);
    assert.equal(resolveConfirmationVisualFamily(main, "input"), id);
  }
});

test("confirmation messages unchanged", () => {
  assert.equal(
    renderConfirmationMessage("Hi {name}, {group} at {time}.", {
      name: "Aleks",
      group: "School",
      time: "21:42",
    }),
    "Hi Aleks, School at 21:42.",
  );
});

test("confirmation CSS covers dark/high-contrast families", () => {
  assert.match(confirmationCss, /data-kc-family="terminal"[\s\S]*?#4ade80/);
  assert.match(confirmationCss, /data-kc-family="bold"[\s\S]*?#1e293b/);
  assert.match(confirmationCss, /data-kc-family="cyber_hex"[\s\S]*?clip-path/);
  assert.match(confirmationCss, /pointer-events:\s*none/);
  assert.match(confirmationCss, /prefers-reduced-motion/);
});
