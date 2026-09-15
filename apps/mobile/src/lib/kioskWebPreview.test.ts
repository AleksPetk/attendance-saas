import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CARD_TEMPLATE_IDS, normalizeKioskVisualDesign, patchMainWithCardTemplate } from "./kioskVisualDesign";
import { buildCardTemplatePickerHtml, buildKioskActionPanelHtml, buildKioskConfirmationPanelHtml, buildKioskPreviewHtml, phoneKioskResponsiveCss, templatePickerSelectionScript } from "./kioskWebPreview/html";
import { KIOSK_WEB_PREVIEW_CSS } from "./kioskWebPreview/bundledCss";
import { KIOSK_FLOW_PANELS_CSS } from "./kioskWebPreview/flowPanelsCss";

const designSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/group/[id]/kiosk-design.tsx", import.meta.url)),
  "utf8",
);

test("template preview uses canonical Workspace mini CSS and markup", () => {
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\.kb-card-template-mini--ticket/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\.kb-card-template-mini--cyber_hex/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\.kb-card-template-mini--polaroid/);
  const html = buildCardTemplatePickerHtml({
    ids: ["clean", "ticket", "cyber_hex"],
    selected: "ticket",
    labels: { ticket: { label: "Ticket", description: "Pass style" } },
  });
  assert.match(html, /kb-card-template-mini--ticket/);
  assert.match(html, /kb-card-mini-deco/);
  assert.match(html, /class="kb-template-card active"/);
  assert.match(html, /classList\.toggle\('active'/);
  assert.doesNotMatch(designSource, /function CardTemplateMini/);
  assert.match(designSource, /KioskWebTemplatePicker/);
});

test("template picker selection updates without remounting document HTML", () => {
  const pickerSource = readFileSync(
    fileURLToPath(new URL("./kioskWebPreview/KioskWebPreview.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(pickerSource, /templatePickerSelectionScript/);
  assert.match(pickerSource, /injectJavaScript/);
  assert.match(pickerSource, /idsKey, labelsKey/);
  assert.doesNotMatch(pickerSource, /\[kind, ids, selected, labels\]/);
  assert.match(designSource, /ids=\{CARD_TEMPLATE_IDS\}/);
  assert.doesNotMatch(designSource, /ids=\{\[\.\.\.CARD_TEMPLATE_IDS\]\}/);
  assert.match(designSource, /styles\.sectionHidden/);
  assert.match(designSource, /EMPTY_PRESET_LABELS/);
  assert.match(templatePickerSelectionScript("kids_bubble"), /kids_bubble/);
  assert.match(templatePickerSelectionScript("kids_bubble"), /classList\.toggle\('active'/);
});

test("selecting a template updates live preview with data-card-template", () => {
  const config = patchMainWithCardTemplate(normalizeKioskVisualDesign({}).main, "polaroid");
  const full = normalizeKioskVisualDesign({ main: config });
  full.main = config;
  full.header.title.text = "受付";
  full.main.title.text = "ようこそ";
  const html = buildKioskPreviewHtml({
    config: full,
    mode: "card",
    people: [{ name: "Ada Lovelace", code: "G12-1", email: "ada@example.com" }],
    gridColumns: 4,
  });
  assert.match(html, /data-card-template="polaroid"/);
  assert.match(html, /data-grid-cols="4"/);
  assert.match(html, /kiosk-person-card/);
  assert.match(html, /受付/);
  assert.match(html, /ようこそ/);
  assert.match(html, /class="kr-shell"/);
  assert.match(html, /class="kr-header"/);
  assert.match(html, /class="kr-main"/);
  assert.match(designSource, /KioskWebLivePreview/);
  assert.match(designSource, /patchMainWithCardTemplate/);
  assert.ok(CARD_TEMPLATE_IDS.includes("terminal"));
});

test("preview layer uses safe-area padding and does not compress under the floating panel", () => {
  assert.match(designSource, /paddingTop: insets\.top/);
  assert.match(designSource, /paddingBottom: insets\.bottom/);
  assert.doesNotMatch(designSource, /testID="kiosk-design-live-preview"[\s\S]{0,120}pointerEvents="none"/);
  assert.match(designSource, /pointerEvents="box-none"/);
  assert.match(designSource, /styles\.previewLayer/);
  assert.match(designSource, /position: "absolute"/);
  assert.match(designSource, /testID="kiosk-design-floating-panel"/);
  assert.doesNotMatch(designSource, /builderBodyTablet/);
});

test("Header and Main titles are rendered through real kr-shell layout CSS", () => {
  const config = normalizeKioskVisualDesign({
    header: { title: { text: "グループ受付タイトル" } },
    main: { title: { text: "ようこそメイン" } },
  });
  const html = buildKioskPreviewHtml({ config, mode: "card", people: [{ name: "Ada", code: "A1", email: "" }] });
  assert.match(html, /グループ受付タイトル/);
  assert.match(html, /ようこそメイン/);
  assert.match(html, /class="kr-header"/);
  assert.match(html, /class="kr-main-title/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /clamp\(72px, 13vh, 130px\)/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\.kr-main-copy/);
});

test("phone runtime uses edge-to-edge safe-area CSS and responsive single-line title fitting", () => {
  const config = normalizeKioskVisualDesign({
    header: { title: { text: "灯りカフェ" } },
    main: { title: { text: "灯りカフェへようこそ" } },
  });
  const portrait = buildKioskPreviewHtml({
    config,
    mode: "card",
    people: [{ name: "山田 夏美", code: "G12-1", email: "" }],
    gridColumns: 2,
    viewportProfile: "phone-portrait",
    safeInsets: { top: 59, right: 0, bottom: 34, left: 0 },
  });
  const landscape = buildKioskPreviewHtml({
    config,
    mode: "card",
    people: [{ name: "山田 夏美", code: "G12-1", email: "" }],
    gridColumns: 4,
    viewportProfile: "phone-landscape",
    safeInsets: { top: 0, right: 59, bottom: 21, left: 59 },
  });

  assert.match(portrait, /data-mobile-viewport="phone-portrait"/);
  assert.match(portrait, /grid-template-rows:calc\(60px \+ 59px\)/);
  assert.match(portrait, /white-space','nowrap'/);
  assert.match(portrait, /while\(title\.scrollWidth>title\.clientWidth/);
  assert.match(landscape, /data-mobile-viewport="phone-landscape"/);
  assert.match(landscape, /grid-template-rows:calc\(48px \+ 0px\)/);
  assert.match(landscape, /repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(landscape, /padding:5px 73px 5px 73px/);
  assert.match(landscape, /--kr-safe-card-width:calc\(\(100vw - 59px - 59px - 28px - 24px\) \/ 4\)/);
  assert.match(landscape, /grid-template-columns:repeat\(4,minmax\(0,var\(--kr-safe-card-width\)\)\)/);
  assert.equal(phoneKioskResponsiveCss("tablet", { top: 24 }), "");
});

test("tablet and phone editor chrome keep absolute full-screen preview", () => {
  assert.match(designSource, /useWindowDimensions/);
  assert.match(designSource, /panelWidth/);
  assert.match(designSource, /previewLayer/);
  assert.match(designSource, /\.\.\.StyleSheet\.absoluteFill/);
  assert.match(designSource, /insets\.left/);
  assert.match(designSource, /insets\.right/);
});

test("live kiosk card browse reuses the same WebView card shell as the editor", () => {
  const liveSource = readFileSync(
    fileURLToPath(new URL("../../app/kiosk/[groupId].tsx", import.meta.url)),
    "utf8",
  );
  assert.match(liveSource, /KioskWebLivePreview/);
  assert.match(liveSource, /interactivePeople/);
  assert.match(liveSource, /viewportProfile=\{viewportProfile\}/);
  assert.match(liveSource, /safeInsets=\{kioskInsets\}/);
  assert.match(liveSource, /styles\.edgeToEdgeShell/);
  assert.match(liveSource, /adjustsFontSizeToFit=\{Boolean\(phonePresentation\)\}/);
  assert.match(liveSource, /testID="kiosk-live-web-shell"/);
  assert.doesNotMatch(liveSource, /function kioskCardAppearance/);
});

test("live kiosk Input identify reuses the same WebView shell and selected input_template", () => {
  const liveSource = readFileSync(
    fileURLToPath(new URL("../../app/kiosk/[groupId].tsx", import.meta.url)),
    "utf8",
  );
  assert.match(liveSource, /showWebInputIdentify/);
  assert.match(liveSource, /kiosk_mode === "input"/);
  assert.match(liveSource, /mode="input"/);
  assert.match(liveSource, /interactiveIdentify/);
  assert.match(liveSource, /onIdentifySubmit/);
  assert.match(liveSource, /testID="kiosk-live-web-input"/);
  assert.match(liveSource, /visualDesign/);
  // Cards path remains distinct and unchanged in structure.
  assert.match(liveSource, /mode="card"/);
  assert.match(liveSource, /interactivePeople/);
});

test("interactive people emit person selection payloads", () => {
  const config = normalizeKioskVisualDesign({});
  const html = buildKioskPreviewHtml({
    config,
    mode: "card",
    people: [{ id: "m:12", name: "Ada", code: "A1", email: "" }],
    interactivePeople: true,
  });
  assert.match(html, /data-person-id="m:12"/);
  assert.match(html, /type: 'person'/);
});

test("interactive Input identify emits payload and applies selected input_template", () => {
  const config = normalizeKioskVisualDesign({
    main: { input_template: "glass" },
  });
  const html = buildKioskPreviewHtml({
    config,
    mode: "input",
    interactiveIdentify: true,
    participantCodeLabel: "Code",
    secondFieldLabel: "Email",
    inputFieldCount: 2,
    showPin: true,
    pinLabel: "PIN",
    continueLabel: "Identify",
    formTitle: "Identify",
  });
  assert.match(html, /data-input-template="glass"/);
  assert.match(html, /data-flow-template="glass"/);
  assert.match(html, /data-kr-mode="live"/);
  assert.match(html, /kiosk-flow--identify/);
  assert.match(html, /id="kiosk-identify-form"/);
  assert.match(html, /type: 'identify'/);
  assert.doesNotMatch(html, /readonly value="G12-1042"/);
  assert.match(html, /kiosk-pin-input/);
});

test("editor Input preview stays readonly sample and still uses input_template", () => {
  const config = normalizeKioskVisualDesign({
    main: { input_template: "soft" },
  });
  const html = buildKioskPreviewHtml({
    config,
    mode: "input",
    participantCodeLabel: "Code",
  });
  assert.match(html, /data-flow-template="soft"/);
  assert.match(html, /data-kr-mode="editor"/);
  assert.match(html, /readonly value="G12-1042"/);
  assert.doesNotMatch(html, /type: 'identify'/);
});

test("bundled CSS includes real card template rules used by Desktop", () => {
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\[data-card-template="ticket"\]/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\[data-card-template="id_badge"\]/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\[data-card-template="cyber_hex"\]/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\[data-card-template="terminal"\]/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /\.kr-header-title/);
  assert.match(KIOSK_WEB_PREVIEW_CSS, /clamp\(72px, 13vh, 130px\)/);
});

test("live action and confirmation panels reuse Desktop/browser markup and flow CSS", () => {
  assert.match(KIOSK_FLOW_PANELS_CSS, /\.kiosk-participant-summary/);
  assert.match(KIOSK_FLOW_PANELS_CSS, /\.kc-unified-panel/);
  assert.match(KIOSK_FLOW_PANELS_CSS, /\.kc-unified-check/);
  const action = buildKioskActionPanelHtml({
    participant: { name: "Ada Lovelace", code: "A1", email: "" },
    actions: [{ id: "check_in", label: "Check-in" }],
    backLabel: "Back",
  });
  assert.match(action, /kiosk-flow--action/);
  assert.match(action, /kiosk-participant-summary/);
  assert.match(action, /kiosk-person-avatar--compact/);
  assert.match(action, /kiosk-action-choice/);
  assert.match(action, /btn-secondary kiosk-submit/);
  assert.match(action, /data-kiosk-action="check_in"/);
  assert.match(action, /data-kiosk-back/);
  const confirmation = buildKioskConfirmationPanelHtml({
    family: "polaroid",
    message: "Welcome, Ada",
    accent: "#2563EB",
  });
  assert.match(confirmation, /kc-unified-panel/);
  assert.match(confirmation, /kc-unified-mark/);
  assert.match(confirmation, /kc-unified-check/);
  assert.match(confirmation, /Welcome, Ada/);
  assert.match(confirmation, /data-kc-family="polaroid"/);
  const config = normalizeKioskVisualDesign({});
  const html = buildKioskPreviewHtml({
    config,
    mode: "card",
    flowStage: "action",
    actionParticipant: { name: "Ada", code: "A1", email: "" },
    actionChoices: [{ id: "check_in", label: "Check-in" }],
    actionBackLabel: "Back",
  });
  assert.match(html, /kiosk-flow--action/);
  assert.match(html, /type: 'action'/);
  assert.match(html, /type: 'back'/);
  assert.doesNotMatch(html, /class="kiosk-people-grid/);
  const liveSource = readFileSync(fileURLToPath(new URL("../../app/kiosk/[groupId].tsx", import.meta.url)), "utf8");
  assert.match(liveSource, /showWebFlowPanel/);
  assert.match(liveSource, /flowStage=\{successMessage \? "confirmation" : "action"\}/);
  assert.match(liveSource, /kiosk-live-web-action/);
  assert.match(liveSource, /kiosk-live-web-confirmation/);
  assert.doesNotMatch(liveSource, /Avatar name=\{participant\.name\}/);
  assert.doesNotMatch(liveSource, /Back to kiosk/);
  assert.doesNotMatch(liveSource, /styles\.confirmationText/);
});

test("phone editor preview uses the same runtime viewport profile while tablet keeps padding", () => {
  const previewSource = readFileSync(
    fileURLToPath(new URL("./kioskWebPreview/KioskWebPreview.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(designSource, /viewportProfile === "tablet" \?/);
  assert.match(designSource, /viewportProfile=\{viewportProfile\}/);
  assert.match(designSource, /safeInsets=\{kioskPreviewInsets\}/);
  assert.match(previewSource, /automaticallyAdjustContentInsets=\{viewportProfile === "tablet"\}/);
  assert.match(previewSource, /contentInsetAdjustmentBehavior="never"/);
});
