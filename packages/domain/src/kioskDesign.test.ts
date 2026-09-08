import assert from "node:assert/strict";
import test from "node:test";
import { normalizeKioskDesignConfig, normalizeKioskDesignDocument, patchKioskDesignConfig, resolveKioskCardTemplate } from "./kioskDesign.js";

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
