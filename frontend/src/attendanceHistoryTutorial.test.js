import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { advanceTutorialFlow, focusedTutorialReturnRoute } from "./tutorialFlow.js";
import { availableTutorialModules } from "./workspaceOnboarding.js";

function ownerSession() {
  return {
    workspace: {
      account_kind: "owner",
      capabilities: {
        can_manage_group_configuration: true,
        can_view_global_members: true,
        can_view_billing: true,
      },
      entitlements: {
        features: {
          report_export_csv: true,
          report_export_excel: true,
          report_export_pdf: true,
        },
        limits: {},
      },
      tutorial: { status: "completed" },
    },
  };
}

function attendanceTutorial() {
  return availableTutorialModules(ownerSession()).find(
    (module) => module.id === "attendance-history",
  );
}

test("Attendance & History tutorial targets real History controls", () => {
  const tutorial = attendanceTutorial();
  const source = [
    readFileSync(new URL("./HistoryScreen.jsx", import.meta.url), "utf8"),
    readFileSync(new URL("./history/ActivityLogPanel.jsx", import.meta.url), "utf8"),
    readFileSync(new URL("./history/AttendanceReportPanel.jsx", import.meta.url), "utf8"),
  ].join("\n");

  assert.equal(tutorial.steps.length, 4);
  for (const target of tutorial.steps.map((step) => step.target)) {
    assert.ok(source.includes(`data-tutorial-target=\"${target}\"`), target);
  }
  assert.ok(tutorial.steps.every((step) => !("action" in step)));
});

test("Activity Log keeps the segmented switch and places filters directly below it", () => {
  const screen = readFileSync(new URL("./HistoryScreen.jsx", import.meta.url), "utf8");
  const activity = readFileSync(
    new URL("./history/ActivityLogPanel.jsx", import.meta.url),
    "utf8",
  );

  assert.match(screen, /history-view-switch/);
  assert.match(screen, /history-page-activity/);
  assert.doesNotMatch(screen, /description=\{t\("description"\)\}/);
  assert.doesNotMatch(activity, /history-view-lede|activity\.lede|activity\.ledeShowing/);
  assert.match(activity, /className="btn-ghost groups-toolbar-clear"/);
  assert.match(activity, /t\("activity\.clear"\)/);
});

test("report steps select the report view without invoking export", () => {
  const tutorial = attendanceTutorial();
  const reportSteps = tutorial.steps.slice(2);

  assert.ok(reportSteps.every((step) => step.route === "/history?view=report"));
  assert.equal(reportSteps[0].target, "attendance-report-filters");
  assert.equal(reportSteps[1].target, "attendance-report-export");
});

test("Attendance & History uses focused completion and returns to Tutorial", () => {
  const module = attendanceTutorial();
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
