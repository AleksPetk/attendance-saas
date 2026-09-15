import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildKioskSettingsSavePayload,
  isKioskSettingsDirty,
  kioskSettingsFormFromApi,
  type KioskSettingsApi,
} from "@checkstation/domain";

const api: KioskSettingsApi = {
  mode: "card",
  confirmation_sound_enabled: true,
  confirmation_vibration_enabled: false,
  confirmation_return_seconds: 3,
  attendance_reset_mode: "daily",
  attendance_reset_daily_time: "08:00:00",
  exit_code_configured: true,
};

test("autosave dirty ignores exit-code drafts when exit is configured", () => {
  const saved = kioskSettingsFormFromApi(api);
  const withExitDraft = { ...saved, exit_code: "ABCD12", exit_code_confirm: "ABCD12", confirmation_sound_enabled: true };
  assert.equal(isKioskSettingsDirty(withExitDraft, saved, {
    changingExitCode: false, savedChangingExitCode: false, exitCodeConfigured: true,
  }), false);
  const withSound = { ...saved, confirmation_sound_enabled: false };
  assert.equal(isKioskSettingsDirty(withSound, saved, {
    changingExitCode: false, savedChangingExitCode: false, exitCodeConfigured: true,
  }), true);
});

test("autosave payload omits exit codes while exit-code save includes them", () => {
  const form = { ...kioskSettingsFormFromApi(api), exit_code: "ABCD12", exit_code_confirm: "ABCD12", confirmation_sound_enabled: false };
  const autosavePayload = buildKioskSettingsSavePayload(form, { changingExitCode: false, exitCodeConfigured: true });
  assert.equal("exit_code" in autosavePayload, false);
  assert.equal("exit_code_confirm" in autosavePayload, false);
  assert.equal(autosavePayload.confirmation_sound_enabled, false);
  const exitPayload = buildKioskSettingsSavePayload(form, { changingExitCode: true, exitCodeConfigured: true });
  assert.equal(exitPayload.exit_code, "ABCD12");
  assert.equal(exitPayload.exit_code_confirm, "ABCD12");
});

test("Mobile Kiosk Settings autosaves normal fields and keeps exit code / reset now explicit", () => {
  const screen = readFileSync(new URL("../../app/(app)/group/[id]/kiosk-settings.tsx", import.meta.url), "utf8");
  assert.match(screen, /useConfigurationAutosave/);
  assert.match(screen, /usePreventRemove/);
  assert.match(screen, /autosave\.flush/);
  assert.match(screen, /t\("kiosk\.saveExitCode"\)/);
  assert.match(screen, /t\("kiosk\.cancelExitCodeChange"\)/);
  assert.match(screen, /t\("kiosk\.resetNow"\)/);
  assert.match(screen, /changingExitCode: false,\s*exitCodeConfigured: true/);
  assert.match(screen, /changingExitCode: true/);
  assert.equal(screen.includes('t("kiosk.saveSettings")'), false);
  assert.equal(screen.includes("Save exit code"), false);
  assert.match(screen, /onBlur=\{flushText\}/);
  assert.match(screen, /NativeAlert\.alert\(t\("kiosk\.resetNow"\)/);
});
