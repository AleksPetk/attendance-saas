import assert from "node:assert/strict";
import { test } from "node:test";

import { tutorialSummaryCopy } from "./tutorialSummary.js";

test("active trial summary uses the canonical trial end date", () => {
  const copy = tutorialSummaryCopy({ active: true, ends_at: "2026-09-06T00:00:00Z" });
  assert.match(copy.trialTitle, /7-day Business trial is active/);
  assert.match(copy.trialBody, /2026/);
});

test("inactive trial summary never makes a false active-trial claim", () => {
  const copy = tutorialSummaryCopy({ active: false, ends_at: "2026-09-01T00:00:00Z" });
  assert.doesNotMatch(copy.trialTitle, /active/i);
  assert.match(copy.trialBody, /never create or change your plan/i);
});

test("replayed Workspace Overview omits the first-onboarding trial announcement", () => {
  const copy = tutorialSummaryCopy(
    { active: true, ends_at: "2026-09-06T00:00:00Z" },
    { showTrialAnnouncement: false },
  );
  assert.equal(copy.title, "Workspace Overview complete");
  assert.equal(copy.trialTitle, "");
  assert.equal(copy.trialBody, "");
});
