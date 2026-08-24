import assert from "node:assert/strict";
import test from "node:test";
import {
  kioskEditorSectionLabel,
  kioskEditorSections,
  kioskPresentationSection,
} from "./kioskEditorSections.js";
import { CARD_TEMPLATE_IDS } from "../cardTemplates.js";
import { INPUT_TEMPLATE_IDS } from "../inputTemplates.js";

test("A: Standard Card kiosk fourth tab is Cards", () => {
  assert.deepEqual(kioskEditorSections({ mode: "card", groupType: "standard" }), [
    "header",
    "main",
    "footer",
    "cards",
  ]);
  assert.equal(kioskPresentationSection({ mode: "card", groupType: "standard" }), "cards");
});

test("B: Standard Input kiosk fourth tab is Input", () => {
  assert.deepEqual(kioskEditorSections({ mode: "input", groupType: "standard" }), [
    "header",
    "main",
    "footer",
    "input",
  ]);
});

test("C: Structured always uses Cards", () => {
  assert.equal(kioskPresentationSection({ mode: "input", groupType: "structured" }), "cards");
});

test("Cards tab uses Card Templates (not Layout/Card Style)", () => {
  assert.equal(CARD_TEMPLATE_IDS.length, 28);
  assert.equal(kioskEditorSectionLabel("cards"), "Cards");
});

test("G: Input presentation still uses input template ids", () => {
  assert.ok(INPUT_TEMPLATE_IDS.includes("clean"));
});

test("H: Card and Input tabs are mutually exclusive by kiosk type", () => {
  const cardSections = kioskEditorSections({ mode: "card", groupType: "standard" });
  const inputSections = kioskEditorSections({ mode: "input", groupType: "standard" });
  assert.ok(cardSections.includes("cards"));
  assert.ok(!cardSections.includes("input"));
  assert.ok(inputSections.includes("input"));
  assert.ok(!inputSections.includes("cards"));
});
