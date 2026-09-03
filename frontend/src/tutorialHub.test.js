import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { tutorialModuleActionLabel, tutorialModuleStatus } from "./tutorialHub.js";

test("Workspace overview reflects persisted onboarding lifecycle", () => {
  assert.equal(tutorialModuleStatus("workspace-overview", { status: "in_progress" }), "In progress");
  assert.equal(tutorialModuleActionLabel("workspace-overview", { status: "in_progress" }), "Continue");
  assert.equal(tutorialModuleActionLabel("workspace-overview", { status: "completed" }), "Restart");
  assert.equal(tutorialModuleActionLabel("workspace-overview", { status: "skipped" }), "Restart");
});

test("focused modules stay voluntary without resetting intro state", () => {
  assert.equal(tutorialModuleStatus("groups", { status: "completed" }), "Available");
  assert.equal(tutorialModuleActionLabel("groups", { status: "completed" }), "Start");
  assert.equal(tutorialModuleStatus("groups", { status: "completed" }, ["groups"]), "Completed");
  assert.equal(tutorialModuleActionLabel("groups", { status: "completed" }, ["groups"]), "Replay");
});

test("focused modules hydrate Completed and Replay from the persisted API payload", () => {
  const persisted = {
    status: "completed",
    completed_module_ids: ["members", "groups"],
  };

  assert.equal(tutorialModuleStatus("members", persisted), "Completed");
  assert.equal(tutorialModuleActionLabel("members", persisted), "Replay");
  assert.equal(tutorialModuleStatus("attendance-history", persisted), "Available");
});

test("focused completion is server-first and has no browser-storage dependency", () => {
  const source = readFileSync(new URL("TutorialContext.jsx", import.meta.url), "utf8");
  const persistCall = source.indexOf("api.completeTutorialModule(tour.module.id)");
  const successFeedback = source.indexOf("tutorialHub.feedbackComplete", persistCall);

  assert.ok(persistCall >= 0);
  assert.ok(successFeedback > persistCall);
  assert.equal(source.includes("localStorage.setItem"), false);
  assert.equal(source.includes("sessionStorage"), false);
});
