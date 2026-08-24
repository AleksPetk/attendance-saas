import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHOTO_CAPABLE_INPUT_TEMPLATE_IDS } from "./kioskPersonInitials.js";
import { INPUT_TEMPLATE_IDS } from "./inputTemplates.js";

const root = dirname(fileURLToPath(import.meta.url));
const visualSrc = readFileSync(join(root, "kioskIdentifyGenericVisual.jsx"), "utf8");
const groupKioskSrc = readFileSync(join(root, "../GroupKioskScreen.jsx"), "utf8");
const sampleSrc = readFileSync(join(root, "builder/EditorSampleContent.jsx"), "utf8");
const flowStagesCss = readFileSync(join(root, "kioskFlowStages.css"), "utf8");
const inputCss = readFileSync(join(root, "inputTemplates.css"), "utf8");
const summarySrc = readFileSync(join(root, "KioskParticipantSummary.jsx"), "utf8");

test("A: photo-capable Input identify form does not request participant photo", () => {
  assert.match(groupKioskSrc, /kiosk-flow--identify[\s\S]{0,400}KioskIdentifyGenericVisual/);
  assert.doesNotMatch(
    groupKioskSrc,
    /kiosk-flow--identify[\s\S]{0,900}photoUrl=\{p\.photo_url\}/,
  );
  assert.doesNotMatch(visualSrc, /<img/);
});

test("B: generic template visual renders before identification", () => {
  assert.match(groupKioskSrc, /kiosk-flow--identify[\s\S]*?KioskIdentifyGenericVisual/);
  assert.match(sampleSrc, /kiosk-flow--identify[\s\S]*?KioskIdentifyGenericVisual/);
  assert.match(visualSrc, /aria-hidden="true"/);
  for (const id of PHOTO_CAPABLE_INPUT_TEMPLATE_IDS) {
    assert.match(
      flowStagesCss,
      new RegExp(`data-flow-template="${id}"[\\s\\S]*?kiosk-flow--identify[\\s\\S]*?kiosk-identify-generic`),
    );
  }
});

test("C: Polaroid no longer reserves a blank image box on all flow panels", () => {
  assert.doesNotMatch(
    inputCss,
    /data-flow-template="polaroid"[\s\S]{0,400}\.kiosk-flow::before[\s\S]{0,200}aspect-ratio/,
  );
  assert.match(flowStagesCss, /kiosk-identify-generic-svg--polaroid/);
  assert.match(visualSrc, /kiosk-identify-generic-svg--polaroid/);
});

test("D: after identification real photo is used if available", () => {
  assert.match(groupKioskSrc, /KioskParticipantSummary[\s\S]*?photoUrl=\{selected\.photo_url\}/);
  assert.match(summarySrc, /photoUrl=\{photoUrl\}/);
});

test("E/F: after identification initials fallback remains on compact avatar", () => {
  const avatarSrc = readFileSync(join(root, "kioskParticipantAvatar.jsx"), "utf8");
  assert.match(avatarSrc, /kiosk-person-initials/);
  assert.match(avatarSrc, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(groupKioskSrc, /photo_url: p\.photo_url \?\? null/);
});

test("G: non-photo Input templates keep generic visual hidden", () => {
  const others = INPUT_TEMPLATE_IDS.filter(
    (id) => !PHOTO_CAPABLE_INPUT_TEMPLATE_IDS.includes(id),
  );
  assert.ok(others.includes("clean"));
  assert.ok(others.includes("terminal"));
  assert.match(flowStagesCss, /\.kiosk-identify-generic \{\s*display:\s*none;/);
  for (const id of others) {
    assert.doesNotMatch(
      flowStagesCss,
      new RegExp(`data-flow-template="${id}"[\\s\\S]{0,80}kiosk-identify-generic`),
    );
  }
});

test("photo-capable Input catalog is polaroid, ID Badge, Kids Bubble", () => {
  assert.deepEqual(PHOTO_CAPABLE_INPUT_TEMPLATE_IDS, [
    "polaroid",
    "id_badge",
    "kids_bubble",
  ]);
});
