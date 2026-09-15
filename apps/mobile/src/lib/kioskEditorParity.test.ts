import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CARD_TEMPLATE_IDS,
  INPUT_TEMPLATE_IDS,
  patchMainWithCardTemplate,
  patchMainWithInputTemplate,
  normalizeKioskVisualDesign,
} from "./kioskVisualDesign";

const designSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/group/[id]/kiosk-design.tsx", import.meta.url)),
  "utf8",
);
const layoutSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/_layout.tsx", import.meta.url)),
  "utf8",
);

test("editor uses a dedicated phone screen while retaining tablet floating panel chrome", () => {
  assert.match(layoutSource, /group\/\[id\]\/kiosk-design[\s\S]*headerShown:\s*false/);
  assert.match(designSource, /testID="kiosk-design-fullscreen"/);
  assert.match(designSource, /testID="kiosk-design-live-preview"/);
  assert.match(designSource, /testID="kiosk-design-floating-panel"/);
  assert.match(designSource, /testID="kiosk-design-phone-editor"/);
  assert.match(designSource, /testID="kiosk-design-phone-preview"/);
  assert.match(designSource, /testID="kiosk-design-phone-scroll"/);
  assert.match(designSource, /previewLayer/);
  assert.doesNotMatch(designSource, /builderBodyTablet/);
  assert.doesNotMatch(designSource, /previewColumn/);
});

test("tablet can minimize and phone preview can restore without dropping draft state", () => {
  assert.match(designSource, /setMinimized\(true\)/);
  assert.match(designSource, /setMinimized\(false\)/);
  assert.match(designSource, /testID="kiosk-design-restore"/);
  assert.match(designSource, /testID="kiosk-design-minimize"/);
  assert.match(designSource, /PanResponder\.create/);
  assert.match(designSource, /positionRef\.current/);
  assert.match(designSource, /historyIndex/);
  assert.match(designSource, /JSON\.stringify\(config\) !== baseline/);
  assert.match(designSource, /phoneEditorOpen/);
  assert.match(designSource, /setPhoneEditorOpen\(true\)/);
  assert.match(designSource, /setPhoneEditorOpen\(false\)/);
  assert.match(designSource, /styles\.phoneEditorFoot/);
  assert.match(designSource, /kiosk-design-phone-close/);
  assert.match(designSource, /kiosk-design-phone-preview/);
  assert.match(designSource, /kiosk-design-phone-scroll/);
  assert.match(designSource, /panelMetrics\.isPhone[\s\S]*phoneEditorOpen/);
});

test("Header and Footer no longer expose incorrect Enabled toggles", () => {
  assert.doesNotMatch(designSource, /patch\("header\.enabled"/);
  assert.doesNotMatch(designSource, /patch\("footer\.enabled"/);
  assert.doesNotMatch(designSource, /SettingSwitch label=\{t\("kiosk\.enabled"\)\}/);
  assert.match(designSource, /forceSectionsEnabled/);
  assert.match(designSource, /testID="kiosk-design-header-section"/);
  assert.match(designSource, /testID="kiosk-design-footer-section"/);
});

test("real shared Card and Input templates are used with Desktop-compatible config values", () => {
  assert.match(designSource, /CARD_TEMPLATE_IDS/);
  assert.match(designSource, /INPUT_TEMPLATE_IDS/);
  assert.match(designSource, /patchMainWithCardTemplate/);
  assert.match(designSource, /patchMainWithInputTemplate/);
  assert.doesNotMatch(designSource, /kiosk\.cardStyle|kiosk\.buttonStyle|kiosk\.inputStyle|kiosk\.layout/);
  assert.equal(CARD_TEMPLATE_IDS[0], "clean");
  assert.ok(CARD_TEMPLATE_IDS.includes("large_touch"));
  assert.equal(INPUT_TEMPLATE_IDS[0], "clean");
  const card = patchMainWithCardTemplate(normalizeKioskVisualDesign({}).main, "business");
  assert.equal(card.card_template, "business");
  assert.equal(card.layout_preset, "split");
  assert.equal(card.card_preset, "bordered");
  const input = patchMainWithInputTemplate(normalizeKioskVisualDesign({}).main, "soft");
  assert.equal(input.input_template, "soft");
  assert.equal(input.button_preset, "pill");
});

test("visual template previews render for Cards and Input", () => {
  assert.match(designSource, /KioskWebTemplatePicker/);
  assert.match(designSource, /KioskWebLivePreview/);
  assert.match(designSource, /bundledCss|kioskWebPreview/);
  assert.doesNotMatch(designSource, /function CardTemplateMini/);
  assert.doesNotMatch(designSource, /function InputTemplateMini/);
});

test("Save Cancel Undo Redo and media field names remain correct", () => {
  assert.match(designSource, /kiosk\.undo/);
  assert.match(designSource, /kiosk\.redo/);
  assert.match(designSource, /kiosk\.saveDesign/);
  assert.match(designSource, /common\.cancel/);
  assert.match(designSource, /main_background_image/);
  assert.match(designSource, /remove_main_background_image/);
  assert.match(designSource, /header_logo/);
  assert.match(designSource, /footer_logo/);
  assert.doesNotMatch(designSource, /appendMedia\(body, "background"/);
});

test("orientation and layout keep draft while reclamping the floating panel", () => {
  assert.match(designSource, /useWindowDimensions/);
  assert.match(designSource, /clampPosition/);
  assert.match(designSource, /useSafeAreaInsets/);
  assert.match(designSource, /panelWidth/);
});

test("KioskDesignScreen keeps all hooks before any early return", () => {
  const screenStart = designSource.indexOf("export default function KioskDesignScreen()");
  const screenEnd = designSource.indexOf("\nfunction FloatingPanel(");
  assert.ok(screenStart >= 0 && screenEnd > screenStart);
  const screen = designSource.slice(screenStart, screenEnd);
  const guardMatch = screen.match(/\n  if \(!canManageGroupConfiguration|\n  if \(loading\)|\n  if \(!config\)/);
  assert.ok(guardMatch && typeof guardMatch.index === "number", "expected an early return guard in KioskDesignScreen");
  const beforeGuards = screen.slice(0, guardMatch.index);
  const afterGuards = screen.slice(guardMatch.index);
  assert.match(beforeGuards, /const previewPeople = useMemo/);
  assert.match(beforeGuards, /setResolvedPreviewMedia/);
  assert.doesNotMatch(afterGuards, /\buse(?:Memo|Effect|Callback|State|Ref)\s*\(/);
  assert.doesNotMatch(afterGuards, /\buseFocusEffect\s*\(/);
});
