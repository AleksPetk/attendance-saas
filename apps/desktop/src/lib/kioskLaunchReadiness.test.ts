import assert from "node:assert/strict";
import test from "node:test";
import { groupLaunchIssueKeys, isKioskLaunchBlocked, kioskSettingsReadiness } from "./kioskLaunchReadiness";

test("uses the server kiosk readiness payload without recreating validation", () => {
  assert.deepEqual(kioskSettingsReadiness({ readiness: { ready: false, issues: ["Exit code required"], exit_code_configured: false } }), {
    ready: false,
    issues: ["Exit code required"],
    exit_code_configured: false,
  });
  assert.equal(kioskSettingsReadiness({ mode: "card" }), null);
});

test("blocks launch while owner readiness is incomplete or unknown", () => {
  assert.equal(isKioskLaunchBlocked({ canInspectKioskSettings: true, settingsLoading: false, kioskReadiness: { ready: false, issues: ["Exit code required"] } }), true);
  assert.equal(isKioskLaunchBlocked({ canInspectKioskSettings: true, settingsLoading: true, kioskReadiness: null }), true);
  assert.equal(isKioskLaunchBlocked({ canInspectKioskSettings: true, settingsLoading: false, kioskReadiness: { ready: true, issues: [] } }), false);
});

test("preserves browser staff behavior while always enforcing Group setup readiness", () => {
  assert.equal(isKioskLaunchBlocked({ canInspectKioskSettings: false, settingsLoading: false, kioskReadiness: null }), false);
  assert.equal(isKioskLaunchBlocked({ groupReadiness: { setup_complete: false }, canInspectKioskSettings: false, settingsLoading: false, kioskReadiness: null }), true);
  assert.deepEqual(groupLaunchIssueKeys({ setup_complete: false, missing_pin_count: 2, missing_email_count: 1 }), [
    { key: "groups.readinessMissingPin", count: 2 },
    { key: "groups.readinessMissingEmail", count: 1 },
  ]);
});
