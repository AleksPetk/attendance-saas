import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { availableSteps, bubblePosition, completionId, dismissalId, guides, shouldAutoStart } from "./guides";
import { completionPath, progressIds, statePath } from "./progress";
const owner = { role: "owner" } as any;
const staff = { role: "staff", workspace: { capabilities: { can_view_global_members: false, can_manage_workspace: false, can_manage_staff_accounts: false, can_manage_owner_account: false, can_view_billing: false } } } as any;
test("desktop auto-entry ignores browser completion and respects desktop skip/completion independently", () => {
  assert.equal(shouldAutoStart(["workspace-overview", "members"], true), true);
  const skipped = [dismissalId];
  assert.equal(shouldAutoStart(skipped, true), false);
  assert.equal(skipped.includes(completionId("workspace-overview")), false);
  assert.equal(shouldAutoStart([completionId("workspace-overview")], true), false);
  assert.equal(shouldAutoStart([], false), false);
});
test("each guide has separate durable namespaced IDs and EN/JA copy", () => {
  assert.equal(guides.length, 8);
  assert.equal(new Set(guides.map(g => completionId(g.id))).size, 8);
  for (const guide of guides) {
    assert.ok(guide.steps.length >= 3);
    for (const text of [guide.title, guide.description, ...guide.steps.flatMap(s => [s.title, s.body])]) {
      assert.ok(text[0].length && text[1].length);
      assert.doesNotMatch(text[0], /^(kiosk|groups|tutorial)\.[a-z]/);
    }
  }
});
test("replay and skip do not erase completed guides or confuse browser state", () => {
  const saved = progressIds({ completed_module_ids: [completionId("members"), completionId("workspace-overview"), dismissalId, "browser-module"] });
  assert.equal(shouldAutoStart(saved, true), false);
  assert.ok(saved.includes(completionId("members")));
  assert.ok(saved.includes("browser-module"));
  assert.equal(completionPath(dismissalId), "/tutorial/modules/desktop-auto-onboarding-dismissed-v1/complete/");
  assert.equal(statePath, "/tutorial/state/");
});
test("Staff is not directed toward unavailable account, plan, staff, or management features", () => {
  const steps = guides.flatMap(g => availableSteps(g, staff));
  assert.ok(steps.length);
  assert.ok(steps.every(s => !["account", "plan", "staff", "configure", "members"].includes(s.access || "")));
  assert.ok(availableSteps(guides[0], owner).length > availableSteps(guides[0], staff).length);
});
test("bubble stays inside normal, maximized, and smaller viewports", () => {
  for (const viewport of [{ width: 1280, height: 840 }, { width: 1920, height: 1080 }, { width: 960, height: 640 }]) {
    for (const rect of [null, { left: viewport.width - 90, right: viewport.width, top: viewport.height - 90, bottom: viewport.height } as DOMRect, { left: 0, right: 280, top: 0, bottom: 840 } as DOMRect]) {
      const position = bubblePosition(rect, 380, 320, viewport);
      assert.ok(position.left >= 16 && position.left + 380 <= viewport.width - 16);
      assert.ok(position.top >= 16 && position.top + 320 <= viewport.height - 16);
    }
  }
});
test("desktop targets match actual classes and tours only activate read-only tabs", () => {
  const source = readFileSync(new URL("./DesktopGuidedHelp.tsx", import.meta.url), "utf8");
  assert.match(source, /waitForTutorialTarget/);
  assert.match(source, /scrollTutorialTargetIntoView/);
  assert.match(source, /completed_module_ids|progressIds/);
  assert.doesNotMatch(source, /api\.(patch|put|delete)|localStorage|api\.post.*(?:kiosk|member|group|billing|security)/);
  assert.match(source, /button\.click\(\)/);
  assert.match(source, /data-segment-value/);
  assert.match(source, /currentStep!\.route === "\/history"/);
  assert.match(source, /useDesktopGuidedGroupTab/);
  assert.match(source, /member-edit/);
  assert.match(source, /configuration-disclosure-toggle/);
  assert.ok(guides.some(guide => guide.steps.some(step => step.reveal === "email-sender")));
  const ui = readFileSync(new URL("../components/ui.tsx", import.meta.url), "utf8");
  assert.match(ui, /data-segment-value=\{option.value\}/);
  const allDesktop = ["../pages/PeoplePage.tsx", "../pages/MemberDetailPage.tsx", "../pages/GroupsPage.tsx", "../pages/GroupDetailPage.tsx", "../pages/HistoryPage.tsx", "../pages/StaffPage.tsx", "../pages/AccountPage.tsx", "../pages/KioskSettingsPage.tsx", "../components/AccountSecurity.tsx", "../shell/DesktopShell.tsx", "../pages/HomePage.tsx", "../pages/PlanPage.tsx"].map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  for (const name of ["members-controls-head", "members-filter-card", "member-edit-profile", "groups-card-grid", "group-configuration", "after-action-settings", "email-sender-status", "desktop-kiosk-settings-grid", "staff-account-groups", "desktop-account-email-grid", "desktop-account-security-summary", "desktop-language-trigger", "desktop-refresh-trigger"]) assert.ok(allDesktop.includes(name), name);
});
