/**
 * Run: node --test src/contactForm.test.js src/accountContactPanel.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { publicFaqUrl, suggestedSubject } from "./contactForm.js";
import { contactCatalogLabel } from "./contactCatalogLabels.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

function readSrc(name) {
  return readFileSync(join(ROOT, name), "utf8");
}

test("suggested subject uses category labels and stays editable-length", () => {
  assert.equal(
    suggestedSubject("Kiosk", "Cannot launch kiosk"),
    "Kiosk: Cannot launch kiosk",
  );
  assert.equal(
    suggestedSubject(
      contactCatalogLabel("en", "members_groups"),
      contactCatalogLabel("en", "add_remove_participant"),
    ),
    "Members & Groups: Add/remove participant",
  );
});

test("FAQ links point at Docs FAQ search, not a local copy", () => {
  assert.equal(
    publicFaqUrl("http://localhost:8091", "Why can't I launch my kiosk?"),
    "http://localhost:8091/faq?q=Why%20can't%20I%20launch%20my%20kiosk%3F",
  );
});

test("Contact frontend does not duplicate canonical FAQ answers", () => {
  const src = readSrc("PublicContactScreen.jsx");
  const apiSrc = readSrc("api.js");
  assert.doesNotMatch(src, /Why can't I launch my kiosk\?/);
  assert.doesNotMatch(src, /What happens to my data if I downgrade/);
  assert.doesNotMatch(src, /@gmail\.com/i);
  assert.match(src, /getContactSuggestions/);
  assert.match(src, /submitContact/);
  assert.match(apiSrc, /\/api\/contact\//);
});

test("promo Contact requests suggestions with explicit lang from page locale", () => {
  const src = readSrc("PublicContactScreen.jsx");
  const apiSrc = readSrc("api.js");
  assert.match(src, /getContactSuggestions\(categoryId, subcategoryId, \{ lang: locale \}\)/);
  assert.match(src, /\[categoryId, subcategoryId, locale\]/);
  assert.match(apiSrc, /query\.set\("lang", lang\)/);
  assert.doesNotMatch(src, /getContactSuggestions\(categoryId, subcategoryId\)\s*\n/);
});

test("promo Contact keeps public Turnstile and does not use workspace submit", () => {
  const src = readSrc("PublicContactScreen.jsx");
  assert.match(src, /turnstile/);
  assert.match(src, /turnstile_token/);
  assert.match(src, /client_type: "public_web"/);
  assert.doesNotMatch(src, /submitWorkspaceContact/);
});
