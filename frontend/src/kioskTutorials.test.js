import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { advanceTutorialFlow, focusedTutorialReturnRoute } from "./tutorialFlow.js";
import { tutorialModuleActionLabel, tutorialModuleStatus } from "./tutorialHub.js";
import { waitForTutorialTarget } from "./tutorialTargeting.js";
import { availableTutorialModules } from "./workspaceOnboarding.js";

function ownerSession(capabilities = {}) {
  return {
    workspace: {
      account_kind: "owner",
      capabilities: {
        can_manage_group_configuration: true,
        can_launch_kiosk: true,
        can_view_global_members: true,
        can_manage_staff_accounts: false,
        can_view_billing: true,
        ...capabilities,
      },
      entitlements: { features: {}, limits: {} },
      tutorial: { status: "completed" },
    },
  };
}

function kioskModules(session = ownerSession()) {
  return availableTutorialModules(session, { groupId: 42 }).filter((module) =>
    ["kiosks", "kiosk-settings", "kiosk-design", "launch-kiosk"].includes(module.id),
  );
}

test("Kiosks Overview orients users to the four real Group kiosk controls", () => {
  const overview = kioskModules().find((module) => module.id === "kiosks");
  assert.equal(overview.title, "Kiosks Overview");
  assert.deepEqual(overview.steps.map((step) => step.id), [
    "kiosk-overview",
    "kiosk-overview-settings",
    "kiosk-overview-design",
    "kiosk-overview-launch",
  ]);
  assert.ok(overview.steps.every((step) => step.route === "/groups/42"));
});

test("Kiosk Settings tutorial navigates to settings and targets every guided area", () => {
  const settings = kioskModules().find((module) => module.id === "kiosk-settings");
  assert.equal(settings.steps.length, 11);
  assert.ok(settings.steps.every((step) => step.route === "/groups/42/kiosk-settings"));
  assert.deepEqual(settings.steps.map((step) => step.target), [
    "kiosk-settings-overview",
    "kiosk-settings-type",
    "kiosk-settings-identification-fields",
    "kiosk-settings-verification",
    "kiosk-settings-exit",
    "kiosk-reset-mode",
    "kiosk-reset-schedule",
    "kiosk-reset-now",
    "kiosk-settings-confirmation",
    "kiosk-confirmation-messages",
    "kiosk-confirmation-return",
  ]);
  assert.match(settings.steps.find((step) => step.id === "kiosk-settings-identification").description, /assigned automatically/);

  const source = [
    readFileSync(new URL("./kiosk/KioskSettingsScreen.jsx", import.meta.url), "utf8"),
    readFileSync(new URL("./kiosk/KioskAttendanceResetSettings.jsx", import.meta.url), "utf8"),
    readFileSync(new URL("./kiosk/KioskConfirmationSettings.jsx", import.meta.url), "utf8"),
  ].join("\n");
  for (const target of settings.steps.map((step) => step.target)) {
    assert.ok(source.includes(target), target);
  }
});

test("Kiosk Settings steps 6 onward resolve real controls below the viewport", async () => {
  const settings = kioskModules().find((module) => module.id === "kiosk-settings");
  const belowViewport = {
    getBoundingClientRect: () => ({ left: 20, top: 1500, right: 620, bottom: 1660, width: 600, height: 160 }),
  };
  for (const step of settings.steps.slice(5)) {
    const root = { querySelector: () => belowViewport };
    assert.equal(
      await waitForTutorialTarget(step.target, {
        root,
        viewport: { innerWidth: 1000, innerHeight: 700 },
      }),
      belowViewport,
      step.id,
    );
  }
});

test("kiosk tutorials contain no mutation, reset, save, or live-launch actions", () => {
  const modules = kioskModules();
  const allSteps = modules.flatMap((module) => module.steps);

  assert.ok(allSteps.every((step) => !("action" in step) && !("submit" in step)));
  assert.ok(allSteps.every((step) => !step.route.startsWith("/kiosk/")));
  assert.equal(
    modules.find((module) => module.id === "kiosk-settings").steps.some((step) => step.id === "kiosk-settings-reset-now"),
    true,
  );
});

test("Kiosk Design opens the real editor and targets preview, tabs, and safe history actions", () => {
  const design = kioskModules().find((module) => module.id === "kiosk-design");
  assert.equal(design.steps.length, 7);
  assert.ok(design.steps.every((step) => step.route === "/groups/42/kiosk-builder"));

  const source = [
    readFileSync(new URL("./kiosk/builder/KioskBuilderScreen.jsx", import.meta.url), "utf8"),
    readFileSync(new URL("./kiosk/builder/FloatingEditorWindow.jsx", import.meta.url), "utf8"),
  ].join("\n");
  for (const target of design.steps.map((step) => step.target).filter((target) => !/^kiosk-design-tab-(header|main|footer)$/.test(target))) {
    assert.ok(source.includes(target), target);
  }
  assert.ok(source.includes("`kiosk-design-tab-${name}`"));
});

test("Launch Kiosk tutorial remains on the safe Group page and never enters live mode", () => {
  const launch = kioskModules().find((module) => module.id === "launch-kiosk");
  assert.equal(launch.steps.length, 5);
  assert.ok(launch.steps.every((step) => step.route === "/groups/42"));
  assert.ok(launch.steps.every((step) => step.target === "group-kiosk-actions" || step.target === "kiosk-launch-action"));
});

test("each kiosk module uses focused completion and becomes Completed / Replay", () => {
  for (const module of kioskModules()) {
    const tour = {
      automatic: false,
      module,
      steps: module.steps,
      index: module.steps.length - 1,
      summary: false,
    };
    const completed = advanceTutorialFlow(tour);
    assert.equal(completed.completionMode, "lightweight", module.id);
    assert.equal(focusedTutorialReturnRoute(completed), "/account/tutorial", module.id);
    assert.equal(tutorialModuleStatus(module.id, { status: "completed" }, [module.id]), "Completed");
    assert.equal(tutorialModuleActionLabel(module.id, { status: "completed" }, [module.id]), "Replay");
  }
});

test("kiosk tutorial cards follow existing configuration and launch capabilities", () => {
  const modules = kioskModules(ownerSession({
    can_manage_group_configuration: false,
    can_launch_kiosk: false,
  }));
  assert.deepEqual(modules.map((module) => module.id), ["kiosks"]);
  assert.deepEqual(modules[0].steps.map((step) => step.id), ["kiosk-overview"]);
});
