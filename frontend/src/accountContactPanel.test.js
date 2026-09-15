/**
 * Run: node --test src/accountContactPanel.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { contactCatalogLabel } from "./contactCatalogLabels.js";
import { suggestedSubject } from "./contactForm.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

function readSrc(name) {
  return readFileSync(join(ROOT, name), "utf8");
}

test("Account Contact tab is registered and rendered from AccountScreen", () => {
  const nav = readSrc("accountNavigation.js");
  const screen = readSrc("AccountScreen.jsx");
  const panels = readSrc("accountPanels.js");
  assert.match(nav, /id: "contact"/);
  assert.match(nav, /path: "\/account\/contact"/);
  assert.match(panels, /contact: "accountSections\.contact"/);
  assert.match(screen, /AccountContactPanel/);
  assert.match(screen, /section === "contact"/);
});

test("Workspace Contact reuses categories/suggestions APIs with explicit lang", () => {
  const src = readSrc("AccountContactPanel.jsx");
  const api = readSrc("api.js");
  assert.match(src, /getContactCategories/);
  assert.match(src, /getContactSuggestions\(categoryId, subcategoryId, \{ lang: locale \}\)/);
  assert.match(src, /\[categoryId, subcategoryId, locale\]/);
  assert.match(api, /\/api\/contact\/suggestions\//);
  assert.match(api, /query\.set\("lang", lang\)/);
});

test("Workspace Contact submits authenticated path without Turnstile", () => {
  const src = readSrc("AccountContactPanel.jsx");
  const api = readSrc("api.js");
  assert.match(src, /submitWorkspaceContact/);
  assert.match(api, /\/api\/contact\/workspace\//);
  assert.doesNotMatch(src, /turnstile/i);
  assert.doesNotMatch(src, /turnstile_token/);
  assert.doesNotMatch(src, /submitContact\(/);
});

test("Workspace Contact prefill uses account email and category subject", () => {
  const src = readSrc("AccountContactPanel.jsx");
  assert.match(src, /account\?\.email/);
  assert.match(src, /readOnly/);
  assert.match(src, /suggestedSubject\(/);
  assert.match(src, /catalogLabel\(locale/);
  assert.equal(
    suggestedSubject(
      contactCatalogLabel("ja", "members_groups"),
      contactCatalogLabel("ja", "add_remove_participant"),
    ),
    "メンバーとグループ: 参加者の追加・削除",
  );
});

test("Workspace Contact expands suggested answers from API markdown", () => {
  const src = readSrc("AccountContactPanel.jsx");
  assert.match(src, /answer_markdown/);
  assert.match(src, /ContentMarkdown/);
  assert.match(src, /account-contact-help-question/);
  assert.match(src, /aria-expanded/);
  assert.doesNotMatch(src, /Why can't I launch my kiosk\?/);
});
