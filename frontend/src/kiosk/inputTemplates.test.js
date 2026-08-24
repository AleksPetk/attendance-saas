import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INPUT_TEMPLATE_IDS,
  INPUT_TEMPLATES,
  patchMainWithInputTemplate,
  resolveInputTemplate,
} from "./inputTemplates.js";
import { CARD_TEMPLATE_IDS } from "./cardTemplates.js";

const root = dirname(fileURLToPath(import.meta.url));
const inputCss = readFileSync(join(root, "inputTemplates.css"), "utf8");
const builderCss = readFileSync(join(root, "builder/kioskBuilder.css"), "utf8");
const pickerSrc = readFileSync(join(root, "builder/InputTemplatePicker.jsx"), "utf8");

const CHARACTER_INPUT_IDS = [
  "kids_bubble",
  "heart_pop",
  "ticket",
  "id_badge",
  "cyber_hex",
  "polaroid",
  "sticker_pack",
  "terminal",
  "ribbon",
  "comic",
];

const LEGACY_INPUT_IDS = [
  "clean",
  "soft",
  "bold",
  "minimal",
  "outline",
  "dark",
  "glass",
  "rounded",
  "compact",
  "large_touch",
];

test("Input catalog exposes legacy + character + family templates", () => {
  assert.equal(INPUT_TEMPLATE_IDS.length, 28);
  for (const id of LEGACY_INPUT_IDS) {
    assert.ok(INPUT_TEMPLATES[id], id);
  }
  for (const id of CHARACTER_INPUT_IDS) {
    assert.ok(INPUT_TEMPLATES[id], id);
    assert.ok(INPUT_TEMPLATE_IDS.includes(id));
  }
});

test("selecting each Input template updates config", () => {
  for (const id of INPUT_TEMPLATE_IDS) {
    const next = patchMainWithInputTemplate(
      { layout_preset: "centered", button_preset: "rounded", input_preset: "outlined" },
      id,
    );
    assert.equal(next.input_template, id);
    assert.equal(next.layout_preset, INPUT_TEMPLATES[id].layout);
    assert.equal(next.button_preset, INPUT_TEMPLATES[id].button);
    assert.equal(next.input_preset, INPUT_TEMPLATES[id].input);
  }
});

test("character Input templates resolve and have distinct CSS + previews", () => {
  for (const id of CHARACTER_INPUT_IDS) {
    assert.equal(resolveInputTemplate({ input_template: id }), id);
    assert.match(inputCss, new RegExp(`data-flow-template="${id}"`));
    assert.match(builderCss, new RegExp(`kb-template-mini--${id}`));
    assert.match(pickerSrc, /INPUT_TEMPLATE_IDS\.map/);
  }

  assert.match(inputCss, /Kids Bubble|kids_bubble[\s\S]*?border-radius:\s*2\.2rem/);
  assert.match(inputCss, /Heart Pop|heart_pop[\s\S]*?fb7185/);
  assert.match(inputCss, /CHECK IN/);
  assert.match(inputCss, /id_badge[\s\S]*?2\.5rem/);
  assert.match(inputCss, /cyber_hex[\s\S]*?clip-path:\s*polygon/);
  assert.match(inputCss, /polaroid[\s\S]*?kiosk-flow--identify::after/);
  assert.match(inputCss, /sticker_pack[\s\S]*?rotate\(-0\.5deg\)/);
  assert.match(inputCss, /terminal[\s\S]*?ui-monospace|Menlo/);
  assert.match(inputCss, /ribbon[\s\S]*?clip-path:\s*polygon/);
  assert.match(inputCss, /comic[\s\S]*?skewX/);
});

test("dark character Input templates keep visible error styling", () => {
  assert.match(inputCss, /cyber_hex[\s\S]*?kiosk-inline-error/);
  assert.match(inputCss, /terminal[\s\S]*?kiosk-inline-error/);
});

test("Input character keys align with Card character keys", () => {
  for (const id of CHARACTER_INPUT_IDS) {
    assert.ok(CARD_TEMPLATE_IDS.includes(id), `${id} should exist as Card template too`);
  }
});

test("legacy Input templates remain unchanged in registry", () => {
  assert.equal(INPUT_TEMPLATES.clean.accent, "#2563EB");
  assert.equal(INPUT_TEMPLATES.dark.accent, "#38BDF8");
  assert.equal(INPUT_TEMPLATES.large_touch.layout, "large_touch");
  assert.equal(resolveInputTemplate({ input_template: "glass" }), "glass");
});

test("Minimal / Outline / Dark / Cyber Hex / Terminal polish readability", () => {
  assert.match(inputCss, /data-flow-template="minimal"[\s\S]*?\.kiosk-flow h2[\s\S]*?color:\s*#0f172a/);
  assert.match(inputCss, /data-flow-template="minimal"[\s\S]*?--kr-tpl-btn-bg:\s*#0f172a/);
  assert.match(inputCss, /data-flow-template="outline"[\s\S]*?--kr-tpl-btn-bg:\s*var\(--kr-accent/);
  assert.match(inputCss, /data-flow-template="outline"[\s\S]*?--kr-tpl-flow-bg:\s*color-mix/);
  assert.match(inputCss, /data-flow-template="dark"[\s\S]*?\.kiosk-flow h2[\s\S]*?color:\s*#f8fafc/);
  assert.match(inputCss, /data-flow-template="dark"[\s\S]*?\.hint[\s\S]*?color:\s*#cbd5e1/);
  assert.match(inputCss, /data-flow-template="cyber_hex"[\s\S]*?\.kiosk-flow h2[\s\S]*?color:\s*#f8fafc/);
  assert.match(inputCss, /data-flow-template="cyber_hex"[\s\S]*?opacity:\s*0\.045/);
  assert.match(inputCss, /data-flow-template="terminal"[\s\S]*?\.kiosk-flow h2[\s\S]*?color:\s*#4ade80/);
  assert.match(inputCss, /data-flow-template="terminal"[\s\S]*?h2::before[\s\S]*?content:\s*"> "/);
  assert.match(inputCss, /data-flow-template="terminal"[\s\S]*?min-height:\s*24rem/);
  assert.match(inputCss, /data-flow-template="terminal"[\s\S]*?-webkit-text-fill-color:\s*#f0fdf4/);
  assert.match(inputCss, /data-flow-template="terminal"[\s\S]*?caret-color:\s*#4ade80/);
  assert.equal(INPUT_TEMPLATES.terminal.input, "outlined");
  assert.match(inputCss, /data-flow-template="dark"[\s\S]*?kiosk-inline-error/);
});
