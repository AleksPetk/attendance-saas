import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { publicFaqUrl, suggestedSubject } from "./contactForm.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

test("suggested subject uses category labels and stays editable-length", () => {
  assert.equal(
    suggestedSubject("Kiosk", "Cannot launch kiosk"),
    "Kiosk: Cannot launch kiosk",
  );
});

test("FAQ links point at Docs FAQ search, not a local copy", () => {
  assert.equal(
    publicFaqUrl("http://localhost:8091", "Why can't I launch my kiosk?"),
    "http://localhost:8091/faq?q=Why%20can't%20I%20launch%20my%20kiosk%3F",
  );
});

test("Contact frontend does not duplicate canonical FAQ answers", () => {
  const src = readFileSync(join(ROOT, "PublicContactScreen.jsx"), "utf8");
  const apiSrc = readFileSync(join(ROOT, "api.js"), "utf8");
  assert.doesNotMatch(src, /Why can't I launch my kiosk\?/);
  assert.doesNotMatch(src, /What happens to my data if I downgrade/);
  assert.doesNotMatch(src, /@gmail\.com/i);
  assert.match(src, /getContactSuggestions/);
  assert.match(src, /submitContact/);
  assert.match(apiSrc, /\/api\/contact\//);
});
