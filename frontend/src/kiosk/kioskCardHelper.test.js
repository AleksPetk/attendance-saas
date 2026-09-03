/**
 * Run: node --test src/kiosk/kioskCardHelper.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const rendererSource = readSource("./KioskRenderer.jsx");
const mainSource = readSource("./KioskMain.jsx");
const previewSource = readSource("./builder/KioskBuilderPreview.jsx");
const sampleSource = readSource("./builder/EditorSampleContent.jsx");
const liveSource = readSource("../GroupKioskScreen.jsx");
const rendererCss = readSource("./kioskRenderer.css");

test("card helper text is owned by the shared renderer rather than card content", () => {
  assert.match(rendererSource, /showCardHelper/);
  assert.match(rendererSource, /helperText/);
  assert.match(rendererSource, /t\("live\.participants\.tapCard"\)/);
  assert.match(rendererSource, /cardHelper=/);
  assert.doesNotMatch(sampleSource, /live\.participants\.tapCard/);
  assert.doesNotMatch(liveSource, /live\.participants\.tapCard/);
});

test("editor and live launcher opt into the same renderer helper", () => {
  assert.match(previewSource, /<KioskRenderer[\s\S]*showCardHelper=/);
  assert.match(previewSource, /groupType === "structured"[\s\S]*live\.participants\.chooseStructured/);
  assert.match(liveSource, /<KioskRenderer[\s\S]*showCardHelper=/);
  assert.match(liveSource, /helperText=\{structuredHelperText\}/);
  assert.match(liveSource, /step === "start"[\s\S]*people\.length > 0/);
});

test("structured step instructions use the shared helper dock without changing copy keys", () => {
  assert.match(liveSource, /step === "classes"[\s\S]*t\("live\.classes\.choose"\)/);
  assert.match(liveSource, /step === "class_pin"[\s\S]*t\("live\.classPinHint"\)/);
  assert.match(liveSource, /step === "start" && people\.length > 0[\s\S]*t\("live\.participants\.chooseStructured"\)/);
  assert.match(liveSource, /step === "confirm"[\s\S]*t\("live\.chooseAction"\)/);
});

test("helper is a Main sibling dock, outside the participant slot", () => {
  const slotEnd = mainSource.indexOf('</div>\n      </div>');
  const dockStart = mainSource.indexOf('className="kr-card-helper-dock"');
  assert.ok(slotEnd >= 0);
  assert.ok(dockStart > slotEnd);
  assert.match(mainSource, /data-card-helper=\{cardHelper \? "on" : "off"\}/);
  assert.match(mainSource, /className="kr-card-helper" role="note"/);
});

test("helper overlays Main without reserving layout space and remains contrast-safe", () => {
  const dockRule = rendererCss.match(/\.kr-card-helper-dock\s*\{[\s\S]*?\}/)?.[0] || "";
  assert.match(dockRule, /position:\s*absolute/);
  assert.match(dockRule, /right:\s*0/);
  assert.match(dockRule, /bottom:\s*0/);
  assert.doesNotMatch(dockRule, /flex:\s*0 0 auto/);
  assert.match(rendererCss, /\.kr-card-helper\s*\{[\s\S]*background:\s*rgba\(15, 23, 42, 0\.82\)/);
  assert.match(rendererCss, /\.kr-card-helper\s*\{[\s\S]*color:\s*#fff/);
  assert.match(rendererCss, /@media \(max-width: 720px\)[\s\S]*\.kr-card-helper/);
});
