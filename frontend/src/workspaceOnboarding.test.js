/** Run: node --test src/workspaceOnboarding.test.js */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  automaticTutorialEligible,
  availableTutorialModules,
  coreWorkspaceTutorialSteps,
  hasLegacyOnboardingCompletion,
  onboardingStorageKey,
} from "./workspaceOnboarding.js";

function ownerSession({ status = "not_started", trialActive = false, features = {}, limits = {}, capabilities = {} } = {}) {
  return {
    workspace: {
      account_kind: "owner",
      workspace_id: "ABC123",
      builtin_trial: { active: trialActive },
      tutorial: { status },
      capabilities: {
        can_manage_workspace: true,
        can_manage_staff_accounts: true,
        can_manage_owner_account: true,
        can_view_global_members: true,
        can_view_billing: true,
        ...capabilities,
      },
      entitlements: { features, limits },
    },
  };
}

describe("workspace tutorial eligibility", () => {
  it("uses persisted tutorial state and is independent from trial activity", () => {
    assert.equal(automaticTutorialEligible(ownerSession({ trialActive: false })), true);
    assert.equal(automaticTutorialEligible(ownerSession({ status: "in_progress", trialActive: false })), true);
    assert.equal(automaticTutorialEligible(ownerSession({ status: "completed", trialActive: true })), false);
    assert.equal(automaticTutorialEligible(ownerSession({ status: "skipped", trialActive: true })), false);
  });

  it("never automatically exposes owner onboarding to workspace staff", () => {
    assert.equal(automaticTutorialEligible({ workspace: { account_kind: "workspace_staff", tutorial: { status: "not_started" } } }), false);
  });

  it("recognizes the old workspace-scoped completion key for safe migration", () => {
    const storage = { getItem: (key) => key === "checkstation-workspace-onboarding:ABC123" ? "done" : null };
    assert.equal(onboardingStorageKey("ABC123"), "checkstation-workspace-onboarding:ABC123");
    assert.equal(hasLegacyOnboardingCompletion("ABC123", storage), true);
  });
});

describe("dynamic tutorial definitions", () => {
  it("builds a complete plan-aware Workspace Overview across the real Workspace routes", () => {
    const session = ownerSession({
      features: {
        structured_groups: true,
        staff_management: true,
        group_forward_emails: true,
        report_export_csv: true,
      },
      limits: {
        active_standard_groups: 10,
        active_structured_groups: 5,
        archived_groups: 10,
      },
    });
    const overview = coreWorkspaceTutorialSteps(session, { groupId: 42 });

    assert.deepEqual(overview.map((item) => item.id), [
      "welcome",
      "overview-dashboard",
      "overview-dashboard-workflow",
      "overview-members",
      "overview-member-create",
      "overview-groups",
      "overview-group-capacity",
      "overview-group-create",
      "overview-group-configuration",
      "overview-group-advanced",
      "overview-kiosk-controls",
      "overview-kiosk-settings",
      "overview-kiosk-reset",
      "overview-kiosk-confirmation",
      "overview-kiosk-design",
      "overview-kiosk-launch",
      "overview-history",
      "overview-attendance-report",
      "overview-email",
      "overview-staff-login",
      "overview-staff-roles",
      "overview-account-security",
      "overview-account-sections",
      "overview-notifications",
      "overview-plan",
    ]);
    assert.equal(overview.length, 25);
    assert.equal(overview.find((item) => item.id === "overview-group-configuration").route, "/groups/new");
    assert.equal(overview.find((item) => item.id === "overview-kiosk-settings").route, "/groups/42/kiosk-settings");
    assert.equal(overview.find((item) => item.id === "overview-kiosk-design").route, "/groups/42/kiosk-builder");
    assert.equal(overview.find((item) => item.id === "overview-attendance-report").route, "/history?view=report");
    assert.equal(overview.find((item) => item.id === "overview-email").route, "/groups/42/edit?tutorial=email-sender");
    assert.ok(overview.every((item) => !("action" in item) && !("submit" in item)));
    assert.ok(overview.every((item) => !item.route?.includes("/kiosk/live")));
  });

  it("uses stable real targets for every anchored Workspace Overview step", () => {
    const source = [
      "DashboardScreen.jsx",
      "MembersScreen.jsx",
      "MemberCreateScreen.jsx",
      "GroupsScreen.jsx",
      "GroupEditorScreen.jsx",
      "GroupDetailScreen.jsx",
      "HistoryScreen.jsx",
      "StaffManagementScreen.jsx",
      "AccountScreen.jsx",
      "AccountTutorialPanel.jsx",
      "AccountStatusPanel.jsx",
      "WorkspaceAnnouncementBell.jsx",
      "workspaceSidebarAccount.js",
      "accountPanels.js",
      "history/AttendanceReportPanel.jsx",
      "kiosk/KioskSettingsScreen.jsx",
      "kiosk/builder/FloatingEditorWindow.jsx",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
    const overview = coreWorkspaceTutorialSteps(ownerSession({
      features: { structured_groups: true, staff_management: true },
    }), { groupId: 42 });

    for (const target of overview.map((item) => item.target).filter(Boolean)) {
      assert.ok(
        source.includes(`data-tutorial-target="${target}"`)
          || source.includes(`"data-tutorial-target": "${target}"`)
          || source.includes(`tutorialTarget="${target}"`),
        target,
      );
    }
  });

  it("keeps route order reversible for Back and Next without side-effect steps", () => {
    const overview = coreWorkspaceTutorialSteps(ownerSession({
      features: { structured_groups: true, staff_management: true },
    }), { groupId: 7 });
    const forwardRoutes = overview.map((item) => item.route);
    const backwardRoutes = [...overview].reverse().map((item) => item.route);

    assert.deepEqual(backwardRoutes, [...forwardRoutes].reverse());
    assert.equal(forwardRoutes.includes("/groups/new"), true);
    assert.equal(forwardRoutes.includes("/groups/7/kiosk-builder"), true);
    assert.equal(forwardRoutes.includes("/account/security"), true);
  });

  it("guides Attendance & History through real activity filters, report filters, and export", () => {
    const session = ownerSession({
      features: {
        report_export_csv: true,
        report_export_excel: true,
        report_export_pdf: true,
      },
    });
    const attendance = availableTutorialModules(session).find(
      (item) => item.id === "attendance-history",
    );

    assert.deepEqual(attendance.steps.map((item) => item.id), [
      "history-tabs",
      "activity-log-filters",
      "attendance-report",
      "attendance-export",
    ]);
    assert.equal(attendance.steps[2].route, "/history?view=report");
    assert.equal(attendance.steps[2].target, "attendance-report-filters");
    assert.equal(attendance.steps[3].target, "attendance-report-export");
    assert.match(attendance.steps[3].description, /PDF, Excel, CSV/);
    assert.ok(attendance.steps.every((item) => !("action" in item)));
  });

  it("describes report export without claiming formats excluded by the plan", () => {
    const attendance = availableTutorialModules(ownerSession()).find(
      (item) => item.id === "attendance-history",
    );
    const exportStep = attendance.steps.find((item) => item.id === "attendance-export");

    assert.match(exportStep.description, /available when your plan includes it/);
    assert.doesNotMatch(exportStep.description, /PDF, Excel, CSV/);
  });

  it("filters Members and plan-gated modules through existing capabilities and entitlements", () => {
    const restricted = ownerSession({ capabilities: { can_view_global_members: false, can_manage_staff_accounts: false }, features: {} });
    const restrictedIds = availableTutorialModules(restricted).map((item) => item.id);
    assert.equal(restrictedIds.includes("members"), false);
    assert.equal(restrictedIds.includes("structured-groups"), false);
    assert.equal(restrictedIds.includes("staff-permissions"), false);
    assert.equal(coreWorkspaceTutorialSteps(restricted).some((item) => item.id === "members"), false);

    const business = ownerSession({ features: { structured_groups: true, staff_management: true, group_forward_emails: true, report_export_csv: true } });
    const businessIds = availableTutorialModules(business, { groupId: 42 }).map((item) => item.id);
    assert.ok(businessIds.includes("members"));
    assert.equal(businessIds.includes("structured-groups"), false);
    assert.ok(businessIds.includes("staff-permissions"));
    assert.ok(businessIds.includes("email-notifications"));
    assert.equal(businessIds.includes("reports"), false);
    assert.ok(businessIds.includes("account-security"));
  });

  it("uses a safe kiosk fallback without creating data when no Group exists", () => {
    const kiosk = coreWorkspaceTutorialSteps(ownerSession()).find((item) => item.id === "overview-kiosk-fallback");
    assert.equal(kiosk.route, "/groups");
    assert.equal(kiosk.target, null);
    assert.match(kiosk.description, /No sample Group or kiosk is created/);
  });

  it("uses a real Group route when a suitable Group exists", () => {
    const kiosk = coreWorkspaceTutorialSteps(ownerSession(), { groupId: 17 }).find((item) => item.id === "overview-kiosk-controls");
    assert.equal(kiosk.route, "/groups/17");
    assert.equal(kiosk.target, "group-kiosk-actions");
  });

  it("adapts unavailable overview areas without presenting them as usable", () => {
    const overview = coreWorkspaceTutorialSteps(ownerSession({
      features: { structured_groups: false, staff_management: false },
      capabilities: {
        can_view_global_members: false,
        can_manage_staff_accounts: false,
        can_view_billing: false,
        can_manage_subscription: false,
      },
    }));

    assert.equal(overview.some((item) => item.id.startsWith("overview-member")), false);
    assert.equal(overview.some((item) => item.id.startsWith("overview-staff")), false);
    assert.equal(overview.some((item) => item.id === "overview-kiosk-settings"), false);
    assert.equal(overview.some((item) => item.id === "overview-email"), false);
    assert.match(overview.find((item) => item.id === "overview-groups").description, /current plan includes/);
    assert.doesNotMatch(overview.find((item) => item.id === "overview-account-sections").description, /Billing covers/);
  });

  it("finishes the Members tutorial at the Add Member form with concise optional-detail guidance", () => {
    const members = availableTutorialModules(ownerSession()).find((item) => item.id === "members");

    assert.deepEqual(members.steps.map((item) => item.id), ["members-list", "members-add", "member-create"]);
    assert.equal(members.steps.at(-1).route, "/members/new");
    assert.equal(members.steps.at(-1).target, "member-create-form");
    assert.equal(members.steps.at(-1).title, "Create a Member");
    assert.match(members.steps.at(-1).description, /Only the name is required/);
    assert.match(members.steps.at(-1).description, /photo helps with recognition/);
    assert.match(members.steps.at(-1).description, /reuse across Groups/);
  });

  it("offers one comprehensive Groups tutorial and no separate Structured Groups module", () => {
    const session = ownerSession({
      features: { structured_groups: true },
      limits: {
        active_standard_groups: 7,
        active_structured_groups: 3,
        archived_groups: 11,
      },
    });
    const modules = availableTutorialModules(session);
    const groups = modules.find((item) => item.id === "groups");

    assert.equal(modules.some((item) => item.id === "structured-groups"), false);
    assert.deepEqual(groups.steps.map((item) => item.id), [
      "groups-overview",
      "groups-capacity",
      "groups-create",
      "group-type",
      "group-name",
      "group-participation",
      "group-actions",
      "group-after-action",
      "group-email",
      "group-next",
    ]);
    assert.equal(groups.steps.find((item) => item.id === "group-type").route, "/groups/new");
    assert.equal(groups.steps.find((item) => item.id === "group-type").target, "group-editor-type");
    assert.match(groups.steps.find((item) => item.id === "group-type").description, /Classes\/Sections/);
    assert.match(groups.steps.find((item) => item.id === "groups-capacity").description, /7 active Standard Groups/);
    assert.match(groups.steps.find((item) => item.id === "groups-capacity").description, /3 active Structured Groups/);
    assert.match(groups.steps.find((item) => item.id === "groups-capacity").description, /11 archived Groups/);
    assert.ok(groups.steps.every((item) => !("action" in item) && !("submit" in item)));
  });

  it("keeps Structured Groups visibly plan-gated inside the Groups tutorial", () => {
    const groups = availableTutorialModules(ownerSession({
      features: { structured_groups: false },
      limits: { active_standard_groups: 2, archived_groups: 2 },
    })).find((item) => item.id === "groups");
    const typeStep = groups.steps.find((item) => item.id === "group-type");
    const capacityStep = groups.steps.find((item) => item.id === "groups-capacity");

    assert.match(typeStep.description, /locked/);
    assert.match(typeStep.description, /not included in your current plan/);
    assert.doesNotMatch(capacityStep.description, /active Structured Group/);
  });
});
