import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { advanceTutorialFlow, focusedTutorialReturnRoute } from "./tutorialFlow.js";
import { groupEmailTutorialPanels } from "./groupEmailTutorial.js";
import { availableTutorialModules } from "./workspaceOnboarding.js";

function ownerSession({ forwarding = true } = {}) {
  return {
    workspace: {
      account_kind: "owner",
      capabilities: {
        can_manage_group_configuration: true,
        can_view_global_members: true,
        can_view_billing: true,
      },
      entitlements: {
        features: { group_forward_emails: forwarding },
        limits: {},
      },
      tutorial: { status: "completed" },
    },
  };
}

function emailTutorial(session = ownerSession()) {
  return availableTutorialModules(session, { groupId: 42 }).find(
    (module) => module.id === "email-notifications",
  );
}

test("email tutorial safely reveals only the requested disclosure panels", () => {
  assert.deepEqual(groupEmailTutorialPanels("?tutorial=email-advanced"), {
    advanced: true,
    sender: false,
    forwarding: false,
  });
  assert.deepEqual(groupEmailTutorialPanels("?tutorial=email-sender"), {
    advanced: true,
    sender: true,
    forwarding: false,
  });
  assert.deepEqual(groupEmailTutorialPanels("?tutorial=email-forward"), {
    advanced: true,
    sender: false,
    forwarding: true,
  });
});

test("Email & Notifications uses five real semantic Group editor targets", () => {
  const tutorial = emailTutorial();
  const source = readFileSync(new URL("./GroupEditorScreen.jsx", import.meta.url), "utf8");

  assert.deepEqual(tutorial.steps.map((step) => step.id), [
    "group-email-overview",
    "group-email-advanced",
    "group-email-sender",
    "group-email-after-action",
    "group-email-forwarding",
  ]);
  for (const target of tutorial.steps.map((step) => step.target)) {
    assert.ok(
      source.includes(`tutorialTarget=\"${target}\"`) ||
        source.includes(`data-tutorial-target=\"${target}\"`),
      target,
    );
  }
});

test("email tutorial has no mutation, test-email, save, or submit action", () => {
  const tutorial = emailTutorial();
  assert.ok(tutorial.steps.every((step) => !("action" in step) && !("submit" in step)));
  assert.ok(tutorial.steps.every((step) => !/test-email|send-test|save/i.test(step.route)));
});

test("forwarding copy follows the current entitlement without hiding the real control", () => {
  const available = emailTutorial().steps.at(-1);
  const locked = emailTutorial(ownerSession({ forwarding: false })).steps.at(-1);

  assert.match(available.description, /up to three additional addresses/);
  assert.match(locked.description, /requires Plus or Business/);
  assert.equal(locked.target, "group-forward-emails");
});

test("Email & Notifications completes through the focused Tutorial return flow", () => {
  const module = emailTutorial();
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
