import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advanceTutorialFlow,
  focusedTutorialReturnRoute,
  skipTutorialFlow,
} from "./tutorialFlow.js";

const base = {
  automatic: true,
  module: { id: "workspace-overview" },
  summary: false,
  index: 0,
  steps: [{ id: "one" }, { id: "two" }],
};

test("completion reaches the shared final summary", () => {
  const last = { ...base, index: 1 };
  assert.deepEqual(advanceTutorialFlow(last).terminalStatus, "completed");
  assert.equal(advanceTutorialFlow(last).summary, true);
  assert.equal(advanceTutorialFlow(last).showTrialAnnouncement, true);
});

test("Skip bypasses remaining steps but reaches the same summary", () => {
  const skipped = skipTutorialFlow(base);
  assert.equal(skipped.summary, true);
  assert.equal(skipped.terminalStatus, "skipped");
  assert.equal(skipped.showTrialAnnouncement, true);
});

test("replayed Workspace Overview keeps the large summary without trial announcement", () => {
  const replay = advanceTutorialFlow({ ...base, automatic: false, index: 1 });
  assert.equal(replay.summary, true);
  assert.equal(replay.terminalStatus, "replayed");
  assert.equal(replay.showTrialAnnouncement, false);
});

test("focused tutorials finish with lightweight feedback instead of global summary", () => {
  const focused = advanceTutorialFlow({
    ...base,
    automatic: false,
    module: { id: "members" },
    index: 1,
  });
  assert.equal(focused.finished, true);
  assert.equal(focused.completionMode, "lightweight");
  assert.equal(focused.summary, false);
  assert.equal(focusedTutorialReturnRoute(focused), "/account/tutorial");
});

test("focused tutorial Exit returns to Tutorial while Workspace Overview does not", () => {
  const focused = { ...base, automatic: false, module: { id: "groups" } };
  const overviewReplay = { ...base, automatic: false };
  assert.equal(focusedTutorialReturnRoute(focused), "/account/tutorial");
  assert.equal(focusedTutorialReturnRoute(overviewReplay), null);
});

test("the comprehensive Groups tutorial finishes through the focused return flow", () => {
  const groups = {
    ...base,
    automatic: false,
    module: { id: "groups" },
    index: 9,
    steps: Array.from({ length: 10 }, (_, index) => ({ id: `groups-${index + 1}` })),
  };
  const completed = advanceTutorialFlow(groups);

  assert.equal(completed.completionMode, "lightweight");
  assert.equal(completed.summary, false);
  assert.equal(focusedTutorialReturnRoute(completed), "/account/tutorial");
});
