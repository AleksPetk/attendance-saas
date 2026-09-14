import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createTranslator } from "@checkstation/i18n";
import { groupSetupIssueSummary } from "./kioskLaunchReadiness.js";

test("both Group Detail clients have exactly one setup warning before tabs, not inside Kiosk", () => {
  const desktop = readFileSync(new URL("../../../apps/desktop/src/pages/GroupDetailPage.tsx", import.meta.url), "utf8");
  const mobile = readFileSync(new URL("../../../apps/mobile/app/(app)/group/[id].tsx", import.meta.url), "utf8");
  assert.equal(desktop.match(/className="group-setup-summary"/g)?.length, 1);
  assert.ok(desktop.indexOf('className="group-setup-summary"') < desktop.indexOf("<Segmented value={displayedTab}"));
  assert.equal(desktop.slice(desktop.indexOf("function KioskManagement(")).includes("kiosk-readiness-warning"), false);
  assert.equal(mobile.match(/style=\{styles\.setupSummary\}/g)?.length, 1);
  assert.ok(mobile.indexOf("style={styles.setupSummary}") < mobile.indexOf('accessibilityRole="tablist"'));
  assert.equal(mobile.slice(mobile.indexOf("function KioskSection(")).includes("styles.readinessIssues"), false);
});

test("compact setup summary uses existing count translations and real server issues", () => {
  const t = createTranslator("en");
  assert.equal(groupSetupIssueSummary({ setup_complete: false, missing_pin_count: 5 }, null, t), "5 participants need a PIN");
  assert.equal(groupSetupIssueSummary({ setup_complete: false, missing_pin_count: 5, missing_email_count: 2 }, { ready: false, issues: ["Exit code required"] }, t), "5 participants need a PIN · 2 participants need an email · Exit code required");
  assert.equal(groupSetupIssueSummary({ setup_complete: true }, { ready: true, issues: [] }, t), "");
  assert.equal(groupSetupIssueSummary({ setup_complete: true }, { ready: false, issues: ["Exit code required"] }, t), "Exit code required");
});

test("structured and Japanese reasons retain the existing shared readiness rules", () => {
  const t = createTranslator("ja");
  const summary = groupSetupIssueSummary({ setup_complete: false, missing_class_pin_count: 2, launchable_class_count: 0 }, null, t);
  assert.equal(summary, `${t("groups.readinessMissingClassPin", { count: 2 })} · ${t("groups.readinessNoLaunchableClass")}`);
  assert.equal(groupSetupIssueSummary(undefined, null, t), "");
});
