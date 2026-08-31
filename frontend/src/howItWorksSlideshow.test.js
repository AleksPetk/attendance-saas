/**
 * Run: node --test src/howItWorksSlideshow.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  HOW_IT_WORKS_SLIDESHOW_INTERVAL_MS,
  nextSlideshowIndex,
  shouldRunSlideshow,
} from "./howItWorksSlideshow.js";


test("Section 4 autoplay interval is five seconds", () => {
  assert.equal(HOW_IT_WORKS_SLIDESHOW_INTERVAL_MS, 5000);
});

test("previous and next navigation wrap across all four slides", () => {
  assert.equal(nextSlideshowIndex(0, 4, 1), 1);
  assert.equal(nextSlideshowIndex(3, 4, 1), 0);
  assert.equal(nextSlideshowIndex(0, 4, -1), 3);
});

test("autoplay pauses outside the viewport, during interaction, and for reduced motion", () => {
  const base = {
    inViewport: true,
    interacting: false,
    reducedMotion: false,
    pageVisible: true,
  };
  assert.equal(shouldRunSlideshow(base), true);
  assert.equal(shouldRunSlideshow({ ...base, inViewport: false }), false);
  assert.equal(shouldRunSlideshow({ ...base, interacting: true }), false);
  assert.equal(shouldRunSlideshow({ ...base, reducedMotion: true }), false);
  assert.equal(shouldRunSlideshow({ ...base, pageVisible: false }), false);
});

test("Section 4 source preserves Admin, Teacher, Manager, Reception slide order", () => {
  const source = readFileSync(new URL("./PublicHowItWorksScreen.jsx", import.meta.url), "utf8");
  const admin = source.indexOf('role: "Admin"');
  const teacher = source.indexOf('role: "Teacher"');
  const manager = source.indexOf('role: "Manager"');
  const reception = source.indexOf('role: "Reception"');
  assert.ok(admin >= 0 && admin < teacher);
  assert.ok(teacher < manager);
  assert.ok(manager < reception);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /setTimerVersion/);
});
