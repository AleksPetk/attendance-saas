import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const host = readFileSync(join(here, "ProductTourHost.tsx"), "utf8");
const tour = readFileSync(join(here, "MobileProductTour.tsx"), "utf8");
const storage = readFileSync(join(here, "productTourStorage.ts"), "utf8");
const assets = readFileSync(join(here, "productTourAssets.ts"), "utf8");
const index = readFileSync(join(here, "../../app/index.tsx"), "utf8");
const layout = readFileSync(join(here, "../../app/_layout.tsx"), "utf8");
const signIn = readFileSync(join(here, "../../app/(auth)/sign-in.tsx"), "utf8");
const help = readFileSync(join(here, "../../app/(app)/help.tsx"), "utf8");

test("mobile product tour host mirrors desktop first-launch gating", () => {
  assert.match(host, /if \(!ready \|\| !prefsReady\) return;/);
  assert.doesNotMatch(
    host,
    /if \(!ready \|\| !prefsReady \|\| !localeSynced\) return;[\s\S]*setMode\("first-launch"\)/,
  );
  assert.match(host, /setMode\("first-launch"\)/);
  assert.match(host, /authState\.status !== "anonymous"/);
  assert.match(host, /mode === "replay-help"/);
});

test("mobile index holds bootstrap until required first-launch tour is open", () => {
  assert.match(index, /awaitingFirstTour/);
  assert.match(index, /!prefs\.seen/);
  assert.match(index, /open && mode === "first-launch"/);
  assert.match(index, /authState\.status === "unknown" \|\| awaitingFirstTour/);
});

test("mobile product tour is hosted at root and separate from Guided Help", () => {
  assert.match(layout, /ProductTourHost/);
  assert.doesNotMatch(host, /requestGuide|MobileGuidedHelp|mobile-guide-/);
  assert.match(help, /openReplay\("replay-help"\)/);
  assert.match(help, /discoverCheckStation/);
  assert.match(help, /help\.guided/);
});

test("customer sign-in exposes What is CheckStation replay", () => {
  assert.match(signIn, /openReplay\("replay-auth"\)/);
  assert.match(signIn, /whatIsCheckStation/);
});

test("mobile product tour persists seen via AsyncStorage key", () => {
  assert.match(storage, /AsyncStorage/);
  assert.match(storage, /checkstation\.productTour\.v1/);
  assert.match(storage, /seen/);
});

test("mobile tour uses optimized slide webps and contain fit", () => {
  for (const n of ["01", "02", "03", "04", "05", "06", "07"]) {
    assert.equal(existsSync(join(here, "assets", `slide-${n}.webp`)), true);
    assert.match(assets, new RegExp(`slide-${n}\\.webp`));
  }
  assert.match(tour, /resizeMode="contain"/);
  assert.match(tour, /phone-portrait|tablet-landscape/);
  assert.match(tour, /pagingEnabled/);
});

test("mobile tour modal unlocks orientations; FullScreenSafeArea is portrait/tablet only", () => {
  assert.match(tour, /FullScreenSafeArea/);
  assert.match(tour, /topComfortGap/);
  assert.match(tour, /supportedOrientations/);
  assert.match(tour, /landscape-left/);
  assert.match(tour, /landscape-right/);
  assert.doesNotMatch(tour, /SafeAreaView/);
  // Phone landscape must not wrap the whole shell in FullScreenSafeArea (empty bands).
  assert.match(tour, /phoneLandscape \? phoneLandscapeShell : defaultShell/);
  assert.match(tour, /plRoot/);
  assert.match(tour, /productTourSafeInsetsForLayout/);
  assert.match(tour, /paddingLeft: landscapePadLeft/);
  assert.match(tour, /paddingRight: landscapePadRight/);
  assert.match(tour, /insets\.left \+ PHONE_LANDSCAPE_GUTTER/);
  assert.match(tour, /insets\.right \+ PHONE_LANDSCAPE_GUTTER/);
});

test("mobile tour has a dedicated full-bleed phone-landscape layout", () => {
  assert.match(tour, /resolveProductTourLayout/);
  assert.match(tour, /productTourLayout/);
  assert.match(tour, /plSlide/);
  assert.match(tour, /plCopy/);
  assert.match(tour, /plVisual/);
  assert.match(tour, /plHeaderRow/);
  assert.match(tour, /plFooterRow/);
  assert.match(tour, /plHeadline/);
  assert.match(tour, /PHONE_LANDSCAPE_HEADER_CONTENT/);
  assert.match(tour, /PHONE_LANDSCAPE_FOOTER_CONTENT/);
  assert.match(tour, /flex:\s*0\.33/);
  assert.match(tour, /flex:\s*0\.67/);
});

test("mobile tour reuses approved desktop copy module", () => {
  assert.match(tour, /productTourSlides/);
  assert.match(tour, /productTourUi/);
  assert.match(tour, /desktop\/src\/productTour\/productTourContent/);
});

test("tablet landscape main area is a static centered View, not a ScrollView", () => {
  assert.match(tour, /tabletLandscapeMain/);
  assert.match(tour, /if \(split\)/);
  // Split (tablet landscape) branch must not wrap content in ScrollView.
  assert.match(
    tour,
    /if \(split\) \{\s*return \(\s*<View style=\{\[styles\.slidePage, \{ width \}\]\}>\s*<View style=\{styles\.tabletLandscapeMain\}>/,
  );
  assert.doesNotMatch(tour, /slideScrollSplit/);
});
