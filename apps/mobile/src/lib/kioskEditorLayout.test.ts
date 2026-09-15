import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  clampEditorPanelPosition,
  isPhoneKioskEditor,
  kioskEditorPanelMetrics,
  kioskEditorPanelWidth,
  kioskPreviewGridColumns,
  kioskSafeInsetsForViewport,
  kioskViewportProfile,
  phoneKioskPresentation,
  preferredKioskEditorPanelPosition,
  snapPhoneEditorPanelPosition,
} from "./kioskEditorLayout";
import { buildKioskPreviewHtml, kioskPreviewGridOverrideCss } from "./kioskWebPreview/html";
import { normalizeKioskVisualDesign } from "./kioskVisualDesign";

const designSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/group/[id]/kiosk-design.tsx", import.meta.url)),
  "utf8",
);

test("portrait resolves to 2 columns and landscape to 4 for phone and tablet sizes", () => {
  assert.equal(kioskPreviewGridColumns(390, 844), 2); // iPhone portrait
  assert.equal(kioskPreviewGridColumns(844, 390), 4); // iPhone landscape
  assert.equal(kioskPreviewGridColumns(820, 1180), 2); // iPad portrait
  assert.equal(kioskPreviewGridColumns(1180, 820), 4); // iPad landscape
});

test("runtime sizing profiles distinguish phone orientations without altering tablet", () => {
  assert.equal(kioskViewportProfile(390, 844), "phone-portrait");
  assert.equal(kioskViewportProfile(844, 390), "phone-landscape");
  assert.equal(kioskViewportProfile(820, 1180), "tablet");
  assert.equal(kioskViewportProfile(1180, 820), "tablet");

  const portrait = phoneKioskPresentation("phone-portrait");
  const landscape = phoneKioskPresentation("phone-landscape", 390);
  assert.ok(portrait);
  assert.ok(landscape);
  assert.equal(landscape.headerHeight, 48);
  assert.equal(landscape.footerHeight, 16);
  assert.equal(landscape.headerLogoHeight, 48);
  assert.equal(landscape.footerLogoHeight, 14);
  assert.equal(landscape.headerTitleMax, 44);
  assert.equal(landscape.footerTextMax, 14);
  assert.equal(landscape.horizontalPadding, 14);
  assert.ok(landscape.mainTitleMax < portrait.mainTitleMax);
  assert.equal(phoneKioskPresentation("tablet"), null);
});

test("phone landscape normalizes stale portrait safe-area values", () => {
  const stalePortraitInsets = { top: 59, right: 0, bottom: 34, left: 0 };
  assert.deepEqual(
    kioskSafeInsetsForViewport("phone-landscape", stalePortraitInsets),
    { top: 0, right: 59, bottom: 21, left: 59 },
  );
  assert.strictEqual(
    kioskSafeInsetsForViewport("phone-portrait", stalePortraitInsets),
    stalePortraitInsets,
  );
  assert.strictEqual(
    kioskSafeInsetsForViewport("tablet", stalePortraitInsets),
    stalePortraitInsets,
  );
});

test("editor panel position stays clamped inside safe bounds", () => {
  const bounds = { width: 1000, height: 700, left: 20, top: 30, right: 10, bottom: 15 };
  assert.deepEqual(
    clampEditorPanelPosition(-100, -50, 320, 400, bounds),
    { x: 28, y: 38 },
  );
  const far = clampEditorPanelPosition(5000, 5000, 320, 400, bounds);
  assert.ok(far.x <= 1000 - 10 - 320 - 8);
  assert.ok(far.y <= 700 - 15 - Math.min(400, 700 - 30 - 15 - 24) - 8);
});

test("editor panel width stays compact like Desktop", () => {
  assert.equal(kioskEditorPanelWidth(1280, 0, 0), 360);
  assert.equal(kioskEditorPanelWidth(320, 0, 0), 296); // max(280, 320-24)
  assert.ok(kioskEditorPanelWidth(400, 10, 10) <= 360);
  assert.ok(kioskEditorPanelWidth(320, 0, 0) >= 280);
});

test("phone metrics are compact while tablet metrics keep the existing editor proportions", () => {
  const portrait = kioskEditorPanelMetrics({ width: 390, height: 844, left: 0, top: 59, right: 0, bottom: 34 });
  assert.equal(portrait.isPhone, true);
  assert.equal(portrait.orientation, "portrait");
  assert.equal(portrait.width, 351);
  assert.equal(portrait.maxHeight, (844 - 59 - 34) * 0.58);

  const landscape = kioskEditorPanelMetrics({ width: 844, height: 390, left: 59, top: 0, right: 59, bottom: 21 });
  assert.equal(landscape.isPhone, true);
  assert.equal(landscape.orientation, "landscape");
  assert.equal(landscape.width, (844 - 59 - 59) * 0.48);
  assert.equal(landscape.maxHeight, (390 - 21) * 0.84);

  const tablet = kioskEditorPanelMetrics({ width: 820, height: 1180, left: 0, top: 24, right: 0, bottom: 20 });
  assert.equal(tablet.isPhone, false);
  assert.equal(tablet.width, 360);
  assert.equal(tablet.maxHeight, Math.min(1180 * 0.68, 730));
  assert.equal(isPhoneKioskEditor(820, 1180), false);
});

test("phone drag snaps predictably without changing tablet free positioning", () => {
  const portraitBounds = { width: 390, height: 844, left: 0, top: 59, right: 0, bottom: 34 };
  const portrait = kioskEditorPanelMetrics(portraitBounds);
  const top = snapPhoneEditorPanelPosition(15, 80, portrait.width, 420, portraitBounds);
  const bottom = snapPhoneEditorPanelPosition(20, 800, portrait.width, 420, portraitBounds);
  assert.equal(top.y, portraitBounds.top + 8);
  assert.ok(bottom.y > top.y);

  const landscapeBounds = { width: 844, height: 390, left: 59, top: 0, right: 59, bottom: 21 };
  const landscape = kioskEditorPanelMetrics(landscapeBounds);
  const right = snapPhoneEditorPanelPosition(700, 30, landscape.width, 300, landscapeBounds);
  assert.equal(right.x, landscapeBounds.width - landscapeBounds.right - landscape.width - 8);
  const preferred = preferredKioskEditorPanelPosition(landscape, 300, landscapeBounds);
  assert.equal(preferred.x, right.x);

  const tabletBounds = { width: 1024, height: 768, left: 0, top: 24, right: 0, bottom: 20 };
  assert.deepEqual(
    snapPhoneEditorPanelPosition(220, 140, 360, 420, tabletBounds),
    clampEditorPanelPosition(220, 140, 360, 420, tabletBounds),
  );
});

test("preview HTML applies forced grid columns without changing card template id", () => {
  const config = normalizeKioskVisualDesign({ main: { card_template: "ticket" } });
  const portrait = buildKioskPreviewHtml({
    config,
    mode: "card",
    people: [{ name: "Ada", code: "A1", email: "" }],
    gridColumns: 2,
  });
  const landscape = buildKioskPreviewHtml({
    config,
    mode: "card",
    people: [{ name: "Ada", code: "A1", email: "" }],
    gridColumns: 4,
  });
  assert.match(portrait, /data-card-template="ticket"/);
  assert.match(portrait, /data-grid-cols="2"/);
  assert.match(landscape, /data-grid-cols="4"/);
  assert.match(portrait, /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(landscape, /repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(kioskPreviewGridOverrideCss(4), /align-items:start/);
});

test("floating panel drag uses stable PanResponder refs and excludes minimize from drag zone", () => {
  assert.match(designSource, /PanResponder\.create/);
  assert.match(designSource, /positionRef\.current/);
  assert.match(designSource, /onPositionRef\.current/);
  assert.match(designSource, /testID="kiosk-design-drag-handle"/);
  assert.match(designSource, /testID="kiosk-design-minimize"/);
  assert.match(designSource, /panelDragZone/);
  // Minimize must not sit inside the panHandlers wrapper.
  const dragBlock = designSource.slice(
    designSource.indexOf('testID="kiosk-design-drag-handle"'),
    designSource.indexOf('testID="kiosk-design-minimize"'),
  );
  assert.doesNotMatch(dragBlock, /kiosk-design-minimize/);
  assert.match(designSource, /onPanResponderTerminationRequest:\s*\(\)\s*=>\s*false/);
});

test("editor chrome matches Desktop dark navy overlay concept", () => {
  assert.match(designSource, /rgba\(7,20,38,0\.97\)/);
  assert.match(designSource, /phoneEditorScreen/);
  assert.match(designSource, /backgroundColor: "#071426"/);
  assert.match(designSource, /#2563eb/);
  assert.match(designSource, /kiosk\.saved|kiosk\.unsaved/);
  assert.match(designSource, /pointerEvents="box-none"/);
  assert.match(designSource, /previewLayer/);
  assert.match(designSource, /kioskPreviewGridColumns/);
  assert.doesNotMatch(designSource, /builderBodyTablet/);
});

test("preview and editor keep independent scroll surfaces", () => {
  assert.match(designSource, /testID="kiosk-design-editor-scroll"/);
  assert.match(designSource, /testID="kiosk-design-phone-scroll"/);
  assert.match(designSource, /pointerEvents=\{hidden \? "none" : "auto"\}/);
  assert.doesNotMatch(designSource, /testID="kiosk-design-live-preview"[\s\S]{0,160}pointerEvents="none"/);
  assert.match(kioskPreviewGridOverrideCss(2), /overflow-y:auto/);
  assert.match(kioskPreviewGridOverrideCss(2), /-webkit-overflow-scrolling:touch/);
});

test("rotation updates grid columns while draft helpers remain mounted", () => {
  assert.match(designSource, /gridColumns=\{gridColumns\}/);
  assert.match(designSource, /useWindowDimensions/);
  assert.match(designSource, /historyIndex/);
  assert.match(designSource, /sampleCount/);
  assert.match(designSource, /setMinimized/);
  assert.match(designSource, /panelLayoutKey/);
  assert.match(designSource, /snapPhoneEditorPanelPosition/);
  assert.match(designSource, /floatingPanelHidden/);
});
