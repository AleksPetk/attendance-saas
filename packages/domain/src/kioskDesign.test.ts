import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_TEMPLATE_IDS,
  INPUT_TEMPLATE_IDS,
  normalizeKioskDesignConfig,
  normalizeKioskDesignDocument,
  patchKioskDesignConfig,
  patchMainWithCardTemplate,
  patchMainWithInputTemplate,
  resolveKioskCardTemplate,
} from "./kioskDesign.js";

test("normalizes the live API envelope and retains media URLs", () => {
  const result = normalizeKioskDesignDocument({ config: { main: { background: { mode: "image" } } }, main_background_image_url: "/media/cafe.jpg" });
  assert.equal(result.config.main.background.mode, "image");
  assert.equal(result.config.main.background.color, "#FFFFFF");
  assert.equal(result.main_background_image_url, "/media/cafe.jpg");
});

test("a one-field edit preserves untouched canonical and future fields", () => {
  const original = normalizeKioskDesignConfig({ version: 1, main: { card_template: "ticket", future_option: { enabled: true } }, future_section: { value: 7 } });
  const edited = patchKioskDesignConfig(original, "header.title.text", "Updated");
  assert.equal(edited.main.card_template, "ticket");
  assert.deepEqual(edited.main.future_option, { enabled: true });
  assert.deepEqual(edited.future_section, { value: 7 });
  assert.equal(edited.header.title.text, "Updated");
});

test("card template remains authoritative over stale legacy layout fields", () => {
  const config = normalizeKioskDesignConfig({ main: { card_template: "photo", layout_preset: "compact", card_preset: "flat" } });
  assert.deepEqual(resolveKioskCardTemplate(config.main), { id: "photo", layout: "photo_cards", card: "elevated" });
});

test("patchMainWithCardTemplate matches Workspace card template IDs and mirrors", () => {
  assert.equal(CARD_TEMPLATE_IDS[0], "clean");
  assert.ok(CARD_TEMPLATE_IDS.includes("large_touch"));
  const main = patchMainWithCardTemplate(normalizeKioskDesignConfig({}).main, "business");
  assert.equal(main.card_template, "business");
  assert.equal(main.layout_preset, "split");
  assert.equal(main.card_preset, "bordered");
});

test("patchMainWithInputTemplate matches Workspace input template IDs and mirrors", () => {
  assert.equal(INPUT_TEMPLATE_IDS[0], "clean");
  assert.ok(INPUT_TEMPLATE_IDS.includes("large_touch"));
  const main = patchMainWithInputTemplate(normalizeKioskDesignConfig({}).main, "soft");
  assert.equal(main.input_template, "soft");
  assert.equal(main.button_preset, "pill");
  assert.equal(main.input_preset, "filled");
});
