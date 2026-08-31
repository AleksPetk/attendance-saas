import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { advanceTutorialFlow, focusedTutorialReturnRoute } from "./tutorialFlow.js";
import {
  firstTutorialStaffAccount,
  staffTutorialRequestsGroupAccess,
} from "./staffTutorial.js";
import { availableTutorialModules } from "./workspaceOnboarding.js";

function ownerSession() {
  return {
    workspace: {
      account_kind: "owner",
      capabilities: {
        can_manage_staff_accounts: true,
        can_manage_workspace_admin_accounts: true,
        can_view_global_members: true,
        can_view_billing: true,
      },
      entitlements: {
        features: { staff_management: true, report_export_csv: true },
        limits: {},
      },
      tutorial: { status: "completed" },
    },
  };
}

function staffTutorial() {
  return availableTutorialModules(ownerSession()).find(
    (module) => module.id === "staff-permissions",
  );
}

test("Staff & Permissions tutorial targets the six real management areas", () => {
  const tutorial = staffTutorial();
  const source = [
    readFileSync(new URL("./StaffManagementScreen.jsx", import.meta.url), "utf8"),
    readFileSync(new URL("./staffGroupAccess.js", import.meta.url), "utf8"),
  ].join("\n");

  assert.deepEqual(tutorial.steps.map((step) => step.id), [
    "staff-login",
    "staff-create",
    "staff-admin-role",
    "staff-role",
    "staff-group-access",
    "staff-account-management",
  ]);
  for (const target of new Set(tutorial.steps.map((step) => step.target))) {
    assert.ok(source.includes(target), target);
  }
});

test("Admin and Staff explanations preserve the implemented security boundary", () => {
  const tutorial = staffTutorial();
  const admin = tutorial.steps.find((step) => step.id === "staff-admin-role");
  const staff = tutorial.steps.find((step) => step.id === "staff-role");

  assert.match(admin.description, /Members, Groups, participants/);
  assert.match(admin.description, /cannot access owner security, subscription or billing/);
  assert.match(admin.description, /cannot create or manage other Admin accounts/);
  assert.match(staff.description, /assigned Groups/);
  assert.match(staff.description, /cannot manage global Members/);
  assert.match(staff.description, /unrelated Groups/);
});

test("Group access tutorial opens the first available Staff account only", () => {
  const accounts = [
    { id: 1, role: "admin", plan_unlocked: true },
    { id: 2, role: "staff", is_plan_locked: true },
    { id: 3, role: "staff", plan_unlocked: true },
  ];

  assert.equal(staffTutorialRequestsGroupAccess("?tutorial=group-access"), true);
  assert.equal(staffTutorialRequestsGroupAccess(""), false);
  assert.equal(firstTutorialStaffAccount(accounts).id, 3);
  assert.equal(firstTutorialStaffAccount(accounts.slice(0, 2)), null);
});

test("Staff tutorial contains no account or permission mutation actions", () => {
  const tutorial = staffTutorial();
  assert.ok(tutorial.steps.every((step) => !("action" in step) && !("submit" in step)));
  assert.ok(tutorial.steps.every((step) => !/create|deactivate|reset|save/.test(step.route)));
});

test("Staff & Permissions completes through the focused Tutorial return flow", () => {
  const module = staffTutorial();
  const completed = advanceTutorialFlow({
    automatic: false,
    module,
    steps: module.steps,
    index: module.steps.length - 1,
    summary: false,
  });

  assert.equal(completed.completionMode, "lightweight");
  assert.equal(completed.summary, false);
  assert.equal(focusedTutorialReturnRoute(completed), "/account/tutorial");
});
