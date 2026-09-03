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

test("Section 4 source preserves Admin, Teacher, Manager, Reception slide order for both locales", () => {
  const source = readFileSync(new URL("./PublicHowItWorksScreen.jsx", import.meta.url), "utf8");
  assert.match(
    source,
    /const SECTION_FOUR_SRCS = \[\s*section4Admin,\s*section4Teacher,\s*section4Manager,\s*section4Reception,\s*\]/,
  );
  assert.match(
    source,
    /const SECTION_FOUR_JA_SRCS = \[\s*section4AdminJa,\s*section4TeacherJa,\s*section4ManagerJa,\s*section4ReceptionJa,\s*\]/,
  );
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /setTimerVersion/);
});
