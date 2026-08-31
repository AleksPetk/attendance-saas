import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { advanceTutorialFlow, focusedTutorialReturnRoute } from "./tutorialFlow.js";
import { tutorialModuleStatus } from "./tutorialHub.js";
import {
  accountSecurityTutorialSteps,
  availableTutorialModules,
  tutorialModuleById,
} from "./workspaceOnboarding.js";

function ownerSession({ capabilities = {}, entitlements = {} } = {}) {
  return {
    workspace: {
      account_kind: "owner",
      capabilities: {
        can_manage_workspace: true,
        can_manage_staff_accounts: true,
        can_manage_owner_account: true,
        can_view_global_members: true,
        can_view_billing: true,
        can_manage_subscription: true,
        ...capabilities,
      },
      entitlements: { features: {}, limits: {}, ...entitlements },
      tutorial: { status: "completed" },
    },
  };
}

function accountTutorial(session = ownerSession()) {
  return availableTutorialModules(session).find((module) => module.id === "account-security");
}

test("Reports tutorial module is removed from Account Tutorial", () => {
  const session = ownerSession({
    entitlements: {
      features: {
        report_export_csv: true,
        report_export_excel: true,
        report_export_pdf: true,
      },
    },
  });
  const moduleIds = availableTutorialModules(session).map((module) => module.id);

  assert.equal(moduleIds.includes("reports"), false);
  assert.equal(tutorialModuleById(session, "reports"), null);
});

test("legacy Reports completion state does not break tutorial module loading", () => {
  const modules = availableTutorialModules(ownerSession());
  const completedModuleIds = ["reports", "account-security"];

  assert.ok(modules.length > 0);
  assert.equal(tutorialModuleStatus("groups", { status: "completed" }, completedModuleIds), "Available");
  assert.equal(tutorialModuleStatus("account-security", { status: "completed" }, completedModuleIds), "Completed");
});

test("Account & Security tutorial walks owner Account tabs in order", () => {
  const tutorial = accountTutorial();
  assert.deepEqual(tutorial.steps.map((step) => step.id), [
    "account-security",
    "account-subscription",
    "account-billing",
    "account-info",
    "account-tutorial",
    "account-status",
  ]);
  assert.deepEqual(tutorial.steps.map((step) => step.route), [
    "/account/security",
    "/account/subscription",
    "/account/billing",
    "/account/info",
    "/account/tutorial",
    "/account/status",
  ]);
});

test("Account & Security tutorial targets real Account panels", () => {
  const tutorial = accountTutorial();
  const source = [
    readFileSync(new URL("./AccountScreen.jsx", import.meta.url), "utf8"),
    readFileSync(new URL("./accountSubscriptionPanel.js", import.meta.url), "utf8"),
    readFileSync(new URL("./accountPanels.js", import.meta.url), "utf8"),
    readFileSync(new URL("./AccountInfoPanel.js", import.meta.url), "utf8"),
    readFileSync(new URL("./AccountTutorialPanel.jsx", import.meta.url), "utf8"),
    readFileSync(new URL("./AccountStatusPanel.jsx", import.meta.url), "utf8"),
  ].join("\n");

  for (const target of tutorial.steps.map((step) => step.target)) {
    assert.ok(
      source.includes(`data-tutorial-target="${target}"`)
        || source.includes(`"data-tutorial-target": "${target}"`),
      target,
    );
  }
  assert.ok(tutorial.steps.every((step) => !("action" in step) && !("submit" in step)));
});

test("Account & Security back/next steps move across adjacent Account routes", () => {
  const steps = accountSecurityTutorialSteps(ownerSession());
  for (let index = 1; index < steps.length; index += 1) {
    assert.notEqual(steps[index].route, steps[index - 1].route);
  }
});

test("CheckStation-managed owners skip Subscription and Billing tutorial steps", () => {
  const managed = ownerSession({
    capabilities: {
      can_view_billing: false,
      can_manage_subscription: false,
    },
  });
  const steps = accountSecurityTutorialSteps(managed);

  assert.deepEqual(steps.map((step) => step.id), [
    "account-security",
    "account-info",
    "account-tutorial",
    "account-status",
  ]);
  assert.equal(steps.some((step) => step.route === "/account/subscription"), false);
  assert.equal(steps.some((step) => step.route === "/account/billing"), false);
});

test("Account & Security uses focused completion and returns to Tutorial", () => {
  const module = accountTutorial();
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
