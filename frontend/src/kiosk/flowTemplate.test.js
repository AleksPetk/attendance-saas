import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFlowTemplate, flowTemplateAccent } from "./flowTemplate.js";
import { patchMainWithCardTemplate } from "./cardTemplates.js";
import { patchMainWithInputTemplate } from "./inputTemplates.js";

const root = dirname(fileURLToPath(import.meta.url));
const rendererSrc = readFileSync(join(root, "KioskRenderer.jsx"), "utf8");
const inputCss = readFileSync(join(root, "inputTemplates.css"), "utf8");
const cardCss = readFileSync(join(root, "cardTemplates.css"), "utf8");

test("card kiosk flow template follows card_template, not input_template", () => {
  const main = patchMainWithCardTemplate(
    patchMainWithInputTemplate({}, "terminal"),
    "heart_pop",
  );
  assert.equal(main.card_template, "heart_pop");
  assert.equal(main.input_template, "terminal");
  assert.equal(resolveFlowTemplate(main, "card"), "heart_pop");
  assert.equal(resolveFlowTemplate(main, "input"), "terminal");
});

test("input kiosk flow template follows input_template", () => {
  const main = patchMainWithInputTemplate({}, "glass");
  assert.equal(resolveFlowTemplate(main, "input"), "glass");
});

test("flow accent reuses input template accent map", () => {
  assert.equal(flowTemplateAccent("heart_pop"), "#FB7185");
  assert.equal(flowTemplateAccent("terminal"), "#4ADE80");
});

test("KioskRenderer exposes flow + behavior attributes", () => {
  assert.match(rendererSrc, /data-kiosk-behavior=\{kioskMode\}/);
  assert.match(rendererSrc, /data-flow-template=\{flowTemplate\}/);
  assert.match(rendererSrc, /resolveFlowTemplate/);
});

test("KioskRenderer derives card-mode structural layout from card template", () => {
  assert.match(rendererSrc, /CARD_TEMPLATES\[cardTemplate\]\?\.layout/);
  assert.match(rendererSrc, /kioskMode === "card"/);
});

test("kiosk-flow CSS is scoped by data-flow-template", () => {
  assert.match(inputCss, /\.kr-shell\[data-flow-template\] \.kiosk-flow/);
  assert.doesNotMatch(inputCss, /data-input-template/);
  assert.match(inputCss, /data-flow-template="terminal"[\s\S]*?\.kiosk-flow h2[\s\S]*?#4ade80/);
  assert.match(inputCss, /data-flow-template="heart_pop"[\s\S]*?\.kiosk-flow/);
});

test("card-only templates have card-mode flow panel styling", () => {
  assert.match(cardCss, /data-kiosk-behavior="card"\]\[data-flow-template="business"\][\s\S]*?\.kiosk-flow/);
  assert.match(cardCss, /data-kiosk-behavior="card"\]\[data-flow-template="photo"\][\s\S]*?\.kiosk-flow/);
  assert.match(cardCss, /data-kiosk-behavior="card"\]\[data-flow-template="bold"\][\s\S]*?#1e293b/);
});
