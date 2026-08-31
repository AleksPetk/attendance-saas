import assert from "node:assert/strict";
import { test } from "node:test";

import {
  preferredTutorialGroup,
  scrollTutorialTargetIntoView,
  tutorialRouteNeedsNavigation,
  tutorialTargetCanBeRevealed,
  tutorialTargetIsVisible,
  waitForTutorialTarget,
} from "./tutorialTargeting.js";

const viewport = { innerWidth: 1000, innerHeight: 700 };
const visibleElement = { getBoundingClientRect: () => ({ left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 }) };

test("route-changing steps navigate only when the requested route differs", () => {
  assert.equal(tutorialRouteNeedsNavigation("/dashboard", "/groups"), true);
  assert.equal(tutorialRouteNeedsNavigation("/groups", "/groups"), false);
  assert.equal(tutorialRouteNeedsNavigation("/history", "/history?view=report"), true);
  assert.equal(tutorialRouteNeedsNavigation("/history?view=report", "/history?view=report"), false);
});

test("target wait resolves an asynchronously rendered semantic target", async () => {
  let current = null;
  let callback;
  class Observer {
    constructor(next) { callback = next; }
    observe() {}
    disconnect() {}
  }
  const root = { body: {}, querySelector: () => current };
  const waiting = waitForTutorialTarget("groups-list", { root, Observer, viewport, timeout: 50 });
  current = visibleElement;
  callback();
  assert.equal(await waiting, visibleElement);
});

test("a vertically offscreen target resolves and scrolls into view before anchoring", async () => {
  let rect = { left: 20, top: 1200, right: 420, bottom: 1340, width: 400, height: 140 };
  let scrollCalls = 0;
  const target = {
    isConnected: true,
    getBoundingClientRect: () => rect,
    scrollIntoView: () => {
      scrollCalls += 1;
      rect = { ...rect, top: 280, bottom: 420 };
    },
  };
  const root = { querySelector: () => target };

  assert.equal(tutorialTargetIsVisible(target, viewport), false);
  assert.equal(tutorialTargetCanBeRevealed(target, viewport), true);
  assert.equal(await waitForTutorialTarget("kiosk-reset-mode", { root, viewport }), target);
  assert.equal(await scrollTutorialTargetIntoView(target, { requestFrame: (callback) => callback() }), true);
  assert.equal(scrollCalls, 1);
  assert.equal(tutorialTargetIsVisible(target, viewport), true);
});

test("Back can reveal and scroll the previous real target again", async () => {
  const calls = [];
  function target(name, top) {
    let rect = { left: 30, top, right: 330, bottom: top + 100, width: 300, height: 100 };
    return {
      isConnected: true,
      getBoundingClientRect: () => rect,
      scrollIntoView: () => {
        calls.push(name);
        rect = { ...rect, top: 250, bottom: 350 };
      },
    };
  }
  const later = target("later", 1400);
  const previous = target("previous", -500);

  await scrollTutorialTargetIntoView(later, { requestFrame: (callback) => callback() });
  await scrollTutorialTargetIntoView(previous, { requestFrame: (callback) => callback() });
  assert.deepEqual(calls, ["later", "previous"]);
});

test("missing or responsive-hidden targets fall back cleanly", async () => {
  const hidden = { getBoundingClientRect: () => ({ left: -400, top: 0, right: -100, bottom: 80, width: 300, height: 80 }) };
  assert.equal(tutorialTargetIsVisible(hidden, viewport), false);
  class Observer { observe() {} disconnect() {} }
  const result = await waitForTutorialTarget("sidebar-groups", {
    root: { body: {}, querySelector: () => hidden },
    Observer,
    viewport,
    timeout: 1,
  });
  assert.equal(result, null);
});

test("Group-specific tutorials prefer an available real Group", () => {
  assert.equal(preferredTutorialGroup([{ id: 1, is_plan_locked: true }, { id: 2, status: "active" }]).id, 2);
  assert.equal(preferredTutorialGroup([]), null);
});
