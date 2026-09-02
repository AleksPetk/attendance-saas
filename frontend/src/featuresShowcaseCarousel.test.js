import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const featuresSource = readFileSync(new URL("./PublicFeaturesScreen.jsx", import.meta.url), "utf8");
const imagesSource = readFileSync(
  new URL("./assets/features/first-section/showcaseImages.js", import.meta.url),
  "utf8",
);
const storyImagesSource = readFileSync(
  new URL("./assets/features/second-section/storyImages.js", import.meta.url),
  "utf8",
);
const demoVideosSource = readFileSync(
  new URL("./assets/features/third-section/demoVideos.js", import.meta.url),
  "utf8",
);
const stylesSource = readFileSync(new URL("./index.css", import.meta.url), "utf8");

test("Features Section 1 reuses one carousel for EN and JA media", () => {
  assert.match(featuresSource, /const images = isJa \? featuresShowcaseJaImages : featuresShowcaseImages/);
  assert.match(featuresSource, /window\.setTimeout\([\s\S]*5000/);
  assert.match(featuresSource, /onClick=\{\(\) => move\(-1\)\}/);
  assert.match(featuresSource, /onClick=\{\(\) => move\(1\)\}/);
});

test("Japanese Features Section 1 maps all seven prepared screenshots", () => {
  const japaneseArray = imagesSource.match(
    /export const featuresShowcaseJaImages = \[([\s\S]*?)\n\];/,
  );

  assert.ok(japaneseArray);
  assert.equal((japaneseArray[1].match(/\{ src:/g) || []).length, 7);
  assert.match(japaneseArray[1], /jaDashboard/);
  assert.match(japaneseArray[1], /jaMembers/);
  assert.match(japaneseArray[1], /jaGroupDetail/);
  assert.match(japaneseArray[1], /jaStaff/);
  assert.match(japaneseArray[1], /jaKioskEditor/);
  assert.match(japaneseArray[1], /jaKioskLauncher/);
  assert.match(japaneseArray[1], /jaExport/);
});

test("localized Features stories keep stable reveal nodes across language changes", () => {
  assert.doesNotMatch(featuresSource, /key=\{story\.title\}/);
  assert.equal(
    (featuresSource.match(/key=\{`features-story-\$\{index\}`\}/g) || []).length,
    2,
  );
});

test("Features Section 2 reuses one carousel with the prepared Japanese media", () => {
  assert.match(
    featuresSource,
    /locale === "ja"[\s\S]*\? membersGroupsStoryJaImages[\s\S]*: membersGroupsStoryImages/,
  );
  assert.doesNotMatch(featuresSource, /reducedMotion \|\| isJa/);
  assert.match(featuresSource, /const safeActiveIndex = activeIndex % images\.length/);

  const japaneseArray = storyImagesSource.match(
    /export const membersGroupsStoryJaImages = \[([\s\S]*?)\n\];/,
  );
  assert.ok(japaneseArray);
  assert.equal((japaneseArray[1].match(/\{ src:/g) || []).length, 3);
  assert.ok(japaneseArray[1].indexOf("jaMembersList") < japaneseArray[1].indexOf("jaAddMember"));
  assert.ok(japaneseArray[1].indexOf("jaAddMember") < japaneseArray[1].indexOf("jaAddParticipant"));
});

test("Features Section 3 reuses the English video player with ordered Japanese clips", () => {
  assert.match(
    featuresSource,
    /locale === "ja"[\s\S]*\? configurableFlowDemoJa[\s\S]*: configurableFlowDemo/,
  );
  assert.doesNotMatch(featuresSource, /if \(isJa\)[\s\S]*LocalizedPromoImage/);
  assert.match(demoVideosSource, /ja-configurable-flow-1\.mp4/);
  assert.match(demoVideosSource, /ja-configurable-flow-2\.mp4/);
  assert.ok(
    demoVideosSource.indexOf("jaClipOne") < demoVideosSource.indexOf("jaClipTwo"),
  );
  assert.match(featuresSource, /\(current \+ 1\) % demo\.clips\.length/);
  assert.match(featuresSource, /preload=\{demo\.preloadNext \? "auto" : "metadata"\}/);
});

test("Features locale changes reset media state and refresh reveal observation", () => {
  assert.ok(
    (featuresSource.match(/setActiveIndex\(0\);[\s\S]{0,40}\}, \[locale\]\);/g) || []).length >= 3,
  );
  assert.match(
    featuresSource,
    /revealItems\.forEach\(\(item\) => observer\.observe\(item\)\);[\s\S]*\}, \[locale\]\);/,
  );
});

test("non-stage Japanese placeholders remain in their own media wrappers", () => {
  const absoluteStageRule = stylesSource.match(
    /\.home-workspace-carousel-stage \.promo-image-placeholder,([\s\S]*?)\{[\s\S]*?position: absolute;/,
  );

  assert.ok(absoluteStageRule);
  assert.doesNotMatch(absoluteStageRule[1], /features-email-window/);
  assert.doesNotMatch(absoluteStageRule[1], /features-history-(?:main|inset)/);
  assert.match(
    stylesSource,
    /\.features-email-window \.promo-image-placeholder,[\s\S]*?\.features-history-inset \.promo-image-placeholder \{[\s\S]*?position: relative;[\s\S]*?height: auto;/,
  );
});
