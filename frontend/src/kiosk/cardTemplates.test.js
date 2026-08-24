import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_TEMPLATE_IDS,
  CARD_TEMPLATES,
  deriveCardTemplate,
  patchMainWithCardTemplate,
  resolveCardTemplate,
} from "./cardTemplates.js";
import { INPUT_TEMPLATE_IDS, resolveInputTemplate } from "./inputTemplates.js";

const root = dirname(fileURLToPath(import.meta.url));
const cardCss = readFileSync(join(root, "cardTemplates.css"), "utf8");
const builderCss = readFileSync(join(root, "builder/kioskBuilder.css"), "utf8");
const groupKioskSrc = readFileSync(join(root, "../GroupKioskScreen.jsx"), "utf8");

function templateBlock(id) {
  const titles = {
    clean: "Clean",
    compact: "Compact",
    business: "Business",
    large_touch: "Large Touch",
    photo: "Photo",
    minimal: "Minimal",
    bold: "Bold",
    glass: "Glass",
    outline: "Outline",
    soft: "Soft",
    kids_bubble: "Kids Bubble",
    heart_pop: "Heart Pop",
    ticket: "Ticket",
    id_badge: "ID Badge",
    cyber_hex: "Cyber Hex",
    polaroid: "Polaroid",
    sticker_pack: "Sticker Pack",
    terminal: "Terminal",
    ribbon: "Ribbon",
    comic: "Comic",
  };
  const title = titles[id] || id;
  const startMark = `/* —— ${title} —— */`;
  const start = cardCss.indexOf(startMark);
  if (start < 0) return "";
  const rest = cardCss.slice(start + startMark.length);
  const nextSection = rest.search(/\/\* —— .+ —— \*\//);
  return nextSection < 0 ? rest : rest.slice(0, nextSection);
}


test("A: Cards system exposes 28 templates", () => {
  assert.equal(CARD_TEMPLATE_IDS.length, 28);
  for (const id of CARD_TEMPLATE_IDS) {
    assert.ok(CARD_TEMPLATES[id], id);
    assert.ok(CARD_TEMPLATES[id].label);
  }
});

test("D: selecting each template updates config", () => {
  for (const id of CARD_TEMPLATE_IDS) {
    const next = patchMainWithCardTemplate(
      { layout_preset: "centered", card_preset: "elevated" },
      id,
    );
    assert.equal(next.card_template, id);
    assert.equal(next.layout_preset, CARD_TEMPLATES[id].layout);
    assert.equal(next.card_preset, CARD_TEMPLATES[id].card);
  }
});

test("M: legacy layout/style maps safely to new template", () => {
  assert.equal(deriveCardTemplate("photo_cards", "bordered"), "photo");
  assert.equal(deriveCardTemplate("large_touch", "elevated"), "large_touch");
  assert.equal(deriveCardTemplate("compact", "flat"), "compact");
  assert.equal(deriveCardTemplate("split", "bordered"), "business");
  assert.equal(deriveCardTemplate("centered", "bordered"), "outline");
  assert.equal(deriveCardTemplate("centered", "flat"), "minimal");
  assert.equal(deriveCardTemplate("centered", "elevated"), "clean");
});

test("resolve prefers explicit card_template", () => {
  assert.equal(
    resolveCardTemplate({
      card_template: "glass",
      layout_preset: "photo_cards",
      card_preset: "bordered",
    }),
    "glass",
  );
});

test("Minimal / Bold / Outline keep ids, labels, and legacy config mirrors", () => {
  for (const id of ["minimal", "bold", "outline"]) {
    assert.ok(CARD_TEMPLATE_IDS.includes(id));
    assert.equal(CARD_TEMPLATES[id].label.length > 0, true);
    const next = patchMainWithCardTemplate({}, id);
    assert.equal(next.card_template, id);
    assert.equal(next.layout_preset, CARD_TEMPLATES[id].layout);
    assert.equal(next.card_preset, CARD_TEMPLATES[id].card);
  }
  assert.equal(resolveCardTemplate({ card_template: "minimal" }), "minimal");
  assert.equal(resolveCardTemplate({ card_template: "bold" }), "bold");
  assert.equal(resolveCardTemplate({ card_template: "outline" }), "outline");
});

test("Minimal polish: lightweight surface, divider, no heavy chrome", () => {
  const block = templateBlock("minimal");
  assert.match(block, /border-bottom:/);
  assert.match(block, /color-mix\(in srgb, #ffffff/);
  assert.doesNotMatch(block, /box-shadow:\s*0\s+\d+px\s+\d+px/);
  assert.match(block, /:active/);
  assert.match(builderCss, /\.kb-card-template-mini--minimal/);
});

test("Bold polish: high-contrast dark card without forced uppercase", () => {
  const block = templateBlock("bold");
  assert.match(block, /background:\s*#1e293b/);
  assert.match(block, /border-left:\s*4px\s+solid/);
  assert.match(block, /text-transform:\s*none/);
  assert.doesNotMatch(block, /text-transform:\s*uppercase/);
  assert.match(block, /\.kiosk-person-name[\s\S]*?color:\s*#f8fafc/);
  assert.match(builderCss, /\.kb-card-template-mini--bold[\s\S]*?#1e293b/);
});

test("Outline polish: accent border with readable inner tint", () => {
  const block = templateBlock("outline");
  assert.match(block, /border:\s*2\.5px\s+solid\s+var\(--kr-accent/);
  assert.match(block, /color-mix\(in srgb, #ffffff 72%/);
  assert.match(block, /\.kiosk-person-sub[\s\S]*?color:\s*#334155/);
  assert.match(block, /:active/);
  assert.match(builderCss, /\.kb-card-template-mini--outline[\s\S]*?#2563eb/);
});

test("Minimal / Bold / Outline preserve containment and shared card renderer", () => {
  for (const id of ["minimal", "bold", "outline"]) {
    assert.match(templateBlock(id), /minmax\(min\(100%,/);
  }
  assert.match(cardCss, /\.kr-shell \.kiosk-person-content[\s\S]*?min-width:\s*0/);
  assert.match(cardCss, /line-clamp:\s*2/);
  assert.ok(
    (groupKioskSrc.match(/<KioskPersonCardFields/g) || []).length >= 2,
    "Standard/Structured Class + participant cards share renderer",
  );
});

test("six character templates are registered with distinct CSS silhouettes", () => {
  const neu = [
    "kids_bubble",
    "heart_pop",
    "ticket",
    "id_badge",
    "cyber_hex",
    "polaroid",
  ];
  for (const id of neu) {
    assert.ok(CARD_TEMPLATE_IDS.includes(id), id);
    assert.equal(resolveCardTemplate({ card_template: id }), id);
    const next = patchMainWithCardTemplate({}, id);
    assert.equal(next.card_template, id);
    assert.equal(next.layout_preset, CARD_TEMPLATES[id].layout);
    assert.equal(next.card_preset, CARD_TEMPLATES[id].card);
    assert.match(cardCss, new RegExp(`data-card-template="${id}"`));
    assert.match(templateBlock(id), /minmax\(min\(100%,/);
    assert.match(builderCss, new RegExp(`kb-card-template-mini--${id}`));
  }

  assert.match(templateBlock("kids_bubble"), /border-radius:\s*2\.4rem/);
  assert.match(templateBlock("heart_pop"), /fb7185|heart/i);
  assert.match(templateBlock("ticket"), /mask-image:/);
  assert.match(templateBlock("id_badge"), /min-height:\s*12\.5rem/);
  assert.match(templateBlock("cyber_hex"), /clip-path:\s*polygon/);
  assert.match(templateBlock("polaroid"), /aspect-ratio:\s*1/);

  assert.match(templateBlock("ticket"), /pointer-events:\s*none|dashed/);
  assert.match(templateBlock("kids_bubble"), /pointer-events:\s*none/);
  assert.match(templateBlock("cyber_hex"), /pointer-events:\s*none/);
});

test("existing ten templates remain available alongside character templates", () => {
  for (const id of [
    "clean",
    "compact",
    "business",
    "large_touch",
    "photo",
    "minimal",
    "bold",
    "glass",
    "outline",
    "soft",
  ]) {
    assert.ok(CARD_TEMPLATES[id], id);
  }
  assert.equal(CARD_TEMPLATE_IDS.length, 28);
});

test("Sticker Pack / Terminal / Ribbon / Comic are distinct silhouettes", () => {
  const neu = ["sticker_pack", "terminal", "ribbon", "comic"];
  for (const id of neu) {
    assert.ok(CARD_TEMPLATE_IDS.includes(id), id);
    assert.equal(resolveCardTemplate({ card_template: id }), id);
    const next = patchMainWithCardTemplate({}, id);
    assert.equal(next.card_template, id);
    assert.match(templateBlock(id), /minmax\(min\(100%,/);
    assert.match(builderCss, new RegExp(`kb-card-template-mini--${id}`));
    assert.match(templateBlock(id), /pointer-events:\s*none|::before|::after/);
  }

  assert.match(templateBlock("sticker_pack"), /rotate\(-0\.6deg\)/);
  assert.match(templateBlock("sticker_pack"), /\.kiosk-person-code/);
  assert.match(templateBlock("terminal"), /ui-monospace|Menlo/);
  assert.match(templateBlock("terminal"), /content:\s*"> "/);
  assert.match(templateBlock("ribbon"), /clip-path:\s*polygon/);
  assert.match(templateBlock("comic"), /border-radius:\s*1\.35rem 1\.35rem 1\.35rem 0\.35rem/);
  assert.match(templateBlock("comic"), /skewX/);
});

test("N: Input Templates remain unchanged", () => {
  assert.ok(INPUT_TEMPLATE_IDS.includes("clean"));
  assert.equal(
    resolveInputTemplate({
      input_template: "dark",
      layout_preset: "centered",
      button_preset: "rounded",
      input_preset: "filled",
    }),
    "dark",
  );
});
