import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_TEMPLATE_IDS } from "./cardTemplates.js";

const root = dirname(fileURLToPath(import.meta.url));
const cardCss =
  readFileSync(join(root, "cardTemplates.css"), "utf8") +
  readFileSync(join(root, "templateFamiliesCard.css"), "utf8");
const indexCss = readFileSync(join(root, "../index.css"), "utf8");
const kioskUiSrc = readFileSync(join(root, "kioskUi.jsx"), "utf8");
const groupKioskSrc = readFileSync(join(root, "../GroupKioskScreen.jsx"), "utf8");
const sampleSrc = readFileSync(join(root, "builder/EditorSampleContent.jsx"), "utf8");

test("A: long name remains inside card via clamp + title on name field", () => {
  assert.match(kioskUiSrc, /kiosk-person-name[\s\S]*?title=\{nameText\}/);
  assert.match(cardCss, /-webkit-line-clamp:\s*2/);
  assert.match(cardCss, /line-clamp:\s*2/);
  assert.match(cardCss, /\.kiosk-person-name[\s\S]*?overflow:\s*hidden/);
  assert.match(indexCss, /-webkit-line-clamp:\s*2/);
});

test("B: long email remains inside card via single-line ellipsis", () => {
  assert.match(kioskUiSrc, /kiosk-person-email[\s\S]*?title=\{email\}/);
  assert.match(cardCss, /\.kiosk-person-email/);
  assert.match(cardCss, /text-overflow:\s*ellipsis/);
  assert.match(cardCss, /white-space:\s*nowrap/);
  assert.match(indexCss, /\.kiosk-person-sub[\s\S]*?text-overflow:\s*ellipsis/);
});

test("C: name + code + email share one contained content wrapper", () => {
  assert.match(kioskUiSrc, /function KioskPersonCardFields/);
  assert.match(kioskUiSrc, /className="kiosk-person-content"/);
  assert.match(kioskUiSrc, /kiosk-person-name/);
  assert.match(kioskUiSrc, /kiosk-person-code/);
  assert.match(kioskUiSrc, /kiosk-person-email/);
  const contentIdx = kioskUiSrc.indexOf('className="kiosk-person-content"');
  const nameIdx = kioskUiSrc.indexOf("kiosk-person-name", contentIdx);
  const codeIdx = kioskUiSrc.indexOf("kiosk-person-code", contentIdx);
  const emailIdx = kioskUiSrc.indexOf("kiosk-person-email", contentIdx);
  assert.ok(contentIdx >= 0);
  assert.ok(nameIdx > contentIdx);
  assert.ok(codeIdx > nameIdx);
  assert.ok(emailIdx > codeIdx);
});

test("D: narrow viewport does not overflow grid (shrink-safe columns)", () => {
  assert.match(indexCss, /minmax\(min\(100%,\s*220px\),\s*1fr\)/);
  assert.match(indexCss, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(cardCss, /minmax\(min\(100%,/);
  for (const id of CARD_TEMPLATE_IDS) {
    const parts = cardCss.split(`[data-card-template="${id}"]`);
    assert.ok(parts.length > 1, `${id} template styles missing`);
    const block = parts.slice(1).join(`[data-card-template="${id}"]`);
    assert.match(
      block,
      /minmax\(min\(100%,|minmax\(0,\s*1fr\)/,
      `${id} must use shrink-safe grid columns`,
    );
  }
});

test("E: Photo template content remains contained beside avatar", () => {
  const parts = cardCss.split('[data-card-template="photo"]');
  const photoBlock = parts.slice(1).join('[data-card-template="photo"]');
  assert.match(photoBlock, /\.kiosk-person-content[\s\S]*?min-width:\s*0/);
  assert.match(cardCss, /\.kiosk-person-avatar[\s\S]*?flex-shrink:\s*0/);
  assert.match(cardCss, /\.kiosk-person-content[\s\S]*?min-width:\s*0/);
});

test("F: all templates inherit shared containment foundation", () => {
  assert.match(cardCss, /\.kr-shell \.kiosk-person-card[\s\S]*?overflow:\s*hidden/);
  assert.match(cardCss, /\.kr-shell \.kiosk-person-content[\s\S]*?min-width:\s*0/);
  assert.match(cardCss, /\.kr-shell \.kiosk-person-content[\s\S]*?max-width:\s*100%/);
  assert.match(cardCss, /box-sizing:\s*border-box/);
  assert.match(indexCss, /\.kiosk-person-card[\s\S]*?overflow:\s*hidden/);
  for (const id of CARD_TEMPLATE_IDS) {
    assert.match(cardCss, new RegExp(`data-card-template="${id}"`));
  }
});

test("G: Structured participant cards use contained field renderer", () => {
  assert.match(groupKioskSrc, /KioskPersonCardFields/);
  assert.match(sampleSrc, /KioskPersonCardFields/);
  // Live kiosk: class picker + participant grid both use the wrapper.
  assert.ok(
    (groupKioskSrc.match(/<KioskPersonCardFields/g) || []).length >= 2,
    "class cards and participant cards should both use KioskPersonCardFields",
  );
});

test("H: Class card long name uses same contained name field", () => {
  assert.match(kioskUiSrc, /kiosk-person-meta[\s\S]*?title=\{meta\}/);
  assert.match(groupKioskSrc, /handleClassTap[\s\S]*?KioskPersonCardFields[\s\S]*?name=\{section\.name\}/);
  assert.match(cardCss, /\.kiosk-person-name[\s\S]*?line-clamp:\s*2/);
});
