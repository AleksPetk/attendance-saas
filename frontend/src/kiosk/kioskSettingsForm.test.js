/**
 * Run: node --test src/kiosk/kioskSettingsForm.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_KIOSK_SETTINGS_FORM,
  isKioskSettingsDirty,
  kioskSettingsFormFromApi,
  normalizeKioskSettingsComparable,
} from "./kioskSettingsForm.js";

const configuredUi = {
  changingExitCode: false,
  savedChangingExitCode: false,
  exitCodeConfigured: true,
};

test("hydrated form is not dirty", () => {
  const saved = kioskSettingsFormFromApi({
    mode: "card",
    card_show_name: true,
    card_show_participant_code: true,
    card_show_email: false,
    use_pin: false,
    input_field_count: 1,
    exit_code_configured: true,
  });
  assert.equal(
    isKioskSettingsDirty(saved, saved, configuredUi),
    false,
  );
});

test("mode change marks dirty", () => {
  const saved = { ...EMPTY_KIOSK_SETTINGS_FORM };
  const draft = { ...saved, mode: "input" };
  assert.equal(isKioskSettingsDirty(draft, saved, configuredUi), true);
});

test("opening exit-code change UI alone does not mark dirty", () => {
  const saved = { ...EMPTY_KIOSK_SETTINGS_FORM };
  assert.equal(
    isKioskSettingsDirty(saved, saved, {
      changingExitCode: true,
      savedChangingExitCode: false,
      exitCodeConfigured: true,
    }),
    false,
  );
});

test("typing exit code marks dirty", () => {
  const saved = { ...EMPTY_KIOSK_SETTINGS_FORM };
  const draft = { ...saved, exit_code: "1234", exit_code_confirm: "1234" };
  assert.equal(
    isKioskSettingsDirty(draft, saved, {
      changingExitCode: true,
      savedChangingExitCode: false,
      exitCodeConfigured: true,
    }),
    true,
  );
});

test("one-field mode ignores second field in comparison", () => {
  const a = normalizeKioskSettingsComparable(
    { ...EMPTY_KIOSK_SETTINGS_FORM, input_field_count: 1, input_second_field: "email" },
    configuredUi,
  );
  const b = normalizeKioskSettingsComparable(
    { ...EMPTY_KIOSK_SETTINGS_FORM, input_field_count: 1, input_second_field: "name" },
    configuredUi,
  );
  assert.deepEqual(a, b);
});

test("confirmation template change no longer marks dirty", () => {
  const saved = { ...EMPTY_KIOSK_SETTINGS_FORM };
  const draft = { ...saved, confirmation_template: "friendly" };
  assert.equal(isKioskSettingsDirty(draft, saved, configuredUi), false);
});

test("confirmation return delay change marks dirty", () => {
  const saved = { ...EMPTY_KIOSK_SETTINGS_FORM };
  const draft = { ...saved, confirmation_return_seconds: 5 };
  assert.equal(isKioskSettingsDirty(draft, saved, configuredUi), true);
});

test("attendance reset mode change marks dirty", () => {
  const saved = { ...EMPTY_KIOSK_SETTINGS_FORM };
  const draft = { ...saved, attendance_reset_mode: "rolling" };
  assert.equal(isKioskSettingsDirty(draft, saved, configuredUi), true);
});
