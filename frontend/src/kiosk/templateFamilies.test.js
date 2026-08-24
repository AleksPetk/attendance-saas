import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_TEMPLATE_IDS,
  CARD_TEMPLATES,
  patchMainWithCardTemplate,
  resolveCardTemplate,
} from "./cardTemplates.js";
import {
  INPUT_TEMPLATE_IDS,
  INPUT_TEMPLATES,
  patchMainWithInputTemplate,
  resolveInputTemplate,
} from "./inputTemplates.js";
import {
  CONFIRMATION_TEMPLATE_IDS,
  CONFIRMATION_TEMPLATES,
} from "./kioskConfirmation.js";

const root = dirname(fileURLToPath(import.meta.url));
const cardCss = readFileSync(join(root, "templateFamiliesCard.css"), "utf8");
const inputCss = readFileSync(join(root, "templateFamiliesInput.css"), "utf8");
const builderCss = readFileSync(join(root, "builder/kioskBuilder.css"), "utf8");
const cardPickerSrc = readFileSync(join(root, "builder/CardTemplatePicker.jsx"), "utf8");
const inputPickerSrc = readFileSync(join(root, "builder/InputTemplatePicker.jsx"), "utf8");

export const FAMILY_TEMPLATE_IDS = [
  "pure",
  "executive",
  "welcome",
  "playground",
  "active",
  "pass",
  "victory",
  "bare",
];

const FAMILY_LABELS = {
  pure: "Pure",
  executive: "Executive",
  welcome: "Welcome",
  playground: "Playground",
  active: "Active",
  pass: "Pass",
  victory: "Victory",
  bare: "Bare",
};

const LEGACY_CARD_COUNT = 20;
const LEGACY_INPUT_COUNT = 20;

test("A: all 8 Card family keys accepted", () => {
  assert.equal(CARD_TEMPLATE_IDS.length, LEGACY_CARD_COUNT + 8);
  for (const id of FAMILY_TEMPLATE_IDS) {
    assert.ok(CARD_TEMPLATES[id], id);
    assert.equal(CARD_TEMPLATES[id].label, FAMILY_LABELS[id]);
    assert.equal(resolveCardTemplate({ card_template: id }), id);
  }
});

test("B: all 8 Input family keys accepted", () => {
  assert.equal(INPUT_TEMPLATE_IDS.length, LEGACY_INPUT_COUNT + 8);
  for (const id of FAMILY_TEMPLATE_IDS) {
    assert.ok(INPUT_TEMPLATES[id], id);
    assert.equal(INPUT_TEMPLATES[id].label, FAMILY_LABELS[id]);
    assert.equal(resolveInputTemplate({ input_template: id }), id);
  }
});

test("C: families appear in selectors with preview tiles", () => {
  for (const id of FAMILY_TEMPLATE_IDS) {
    assert.match(cardPickerSrc, /CARD_TEMPLATE_IDS\.map/);
    assert.match(inputPickerSrc, /INPUT_TEMPLATE_IDS\.map/);
    assert.match(cardCss, new RegExp(`data-card-template="${id}"`));
    assert.match(inputCss, new RegExp(`data-flow-template="${id}"`));
    assert.match(builderCss, new RegExp(`kb-card-template-mini--${id}`));
    assert.match(builderCss, new RegExp(`kb-template-mini--${id}`));
  }
});

test("D: selecting each family updates config", () => {
  for (const id of FAMILY_TEMPLATE_IDS) {
    const cardNext = patchMainWithCardTemplate({}, id);
    assert.equal(cardNext.card_template, id);
    assert.equal(cardNext.layout_preset, CARD_TEMPLATES[id].layout);
    assert.equal(cardNext.card_preset, CARD_TEMPLATES[id].card);

    const inputNext = patchMainWithInputTemplate({}, id);
    assert.equal(inputNext.input_template, id);
    assert.equal(inputNext.layout_preset, INPUT_TEMPLATES[id].layout);
    assert.equal(inputNext.button_preset, INPUT_TEMPLATES[id].button);
    assert.equal(inputNext.input_preset, INPUT_TEMPLATES[id].input);
  }
});

test("distinct family silhouettes in Card + Input CSS", () => {
  assert.match(cardCss, /pure[\s\S]*?linear-gradient\(135deg/);
  assert.match(cardCss, /executive[\s\S]*?grid-template-columns:\s*auto 1fr/);
  assert.match(cardCss, /welcome[\s\S]*?border-radius:\s*1\.5rem 1\.5rem 1\.5rem 0\.55rem/);
  assert.match(cardCss, /playground[\s\S]*?linear-gradient\(90deg,\s*var\(--pg-a\)/);
  assert.match(cardCss, /active[\s\S]*?skewX\(-16deg\)/);
  assert.match(cardCss, /pass[\s\S]*?repeating-linear-gradient/);
  assert.match(cardCss, /victory[\s\S]*?radial-gradient\(circle/);
  assert.match(cardCss, /bare[\s\S]*?border-bottom:\s*1px solid/);

  assert.match(inputCss, /pure[\s\S]*?\.kiosk-flow::before/);
  assert.match(inputCss, /executive[\s\S]*?grid-template-columns:\s*auto 1fr/);
  assert.match(inputCss, /playground[\s\S]*?--kr-tpl-flow-shadow:\s*0 8px 0/);
  assert.match(inputCss, /active[\s\S]*?text-transform:\s*uppercase/);
  assert.match(inputCss, /pass[\s\S]*?repeating-linear-gradient/);
  assert.match(inputCss, /bare[\s\S]*?border-bottom:\s*1px solid #94a3b8/);
});

test("K: long content containment inherited on family cards", () => {
  for (const id of FAMILY_TEMPLATE_IDS) {
    assert.match(
      cardCss,
      new RegExp(`data-card-template="${id}"[\\s\\S]*?\\.kiosk-people-grid[\\s\\S]*?minmax\\(min\\(100%,`),
    );
  }
});

test("L/M/N: existing Card/Input templates preserved; Confirmation selector removed", () => {
  assert.equal(CONFIRMATION_TEMPLATE_IDS.length, 8);
  assert.deepEqual(
    CONFIRMATION_TEMPLATE_IDS,
    ["clean", "business", "friendly", "kids", "fitness", "event", "celebration", "minimal"],
  );
  assert.equal(CONFIRMATION_TEMPLATES.length, 8);
  for (const id of ["clean", "minimal", "terminal", "heart_pop"]) {
    assert.ok(CARD_TEMPLATES[id], `existing card ${id}`);
    assert.ok(INPUT_TEMPLATES[id], `existing input ${id}`);
  }
  assert.ok(CARD_TEMPLATES.business, "existing card business");
  // Stage-1 family keys must not collide with legacy confirmation storage ids that are not Card/Input keys.
  for (const id of ["friendly", "kids", "fitness", "event", "celebration"]) {
    assert.ok(!CARD_TEMPLATE_IDS.includes(id), `${id} remains confirmation-legacy-only`);
  }
});

test("no key collisions with legacy template ids", () => {
  const allCard = new Set(CARD_TEMPLATE_IDS);
  const allInput = new Set(INPUT_TEMPLATE_IDS);
  assert.equal(allCard.size, CARD_TEMPLATE_IDS.length);
  assert.equal(allInput.size, INPUT_TEMPLATE_IDS.length);
  for (const id of FAMILY_TEMPLATE_IDS) {
    assert.ok(!["clean", "business", "minimal"].includes(id));
  }
});
