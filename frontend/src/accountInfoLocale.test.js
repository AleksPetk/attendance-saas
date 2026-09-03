import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { workspaceDocsDocumentUrl, workspaceDocsHomeUrl } from "./publicFooterLinks.js";

const accountInfoSource = readFileSync(
  new URL("./AccountInfoPanel.js", import.meta.url),
  "utf8",
);
const accountScreenSource = readFileSync(
  new URL("./AccountScreen.jsx", import.meta.url),
  "utf8",
);

test("workspace docs URLs preserve workspace locale prefix", () => {
  assert.equal(workspaceDocsHomeUrl("ja"), "http://localhost:8091/ja/");
  assert.equal(workspaceDocsDocumentUrl("getting-started", "ja"), "http://localhost:8091/ja/getting-started");
  assert.equal(workspaceDocsDocumentUrl("getting-started", "en"), "http://localhost:8091/en/getting-started");
});

test("Account Info loads docs with workspace language query param", () => {
  assert.match(accountInfoSource, /listContentDocuments\(\{ lang: resolvedLang \}\)/);
  assert.match(accountInfoSource, /getContentDocument\(selectedSlug, \{ lang: resolvedLang \}\)/);
  assert.match(accountInfoSource, /listContentFaq\(\{ lang: resolvedLang \}\)/);
  assert.match(accountInfoSource, /contentLang = "en"/);
  assert.doesNotMatch(accountInfoSource, /checkstation\.docs\.locale/);
});

test("AccountScreen passes workspace locale into Account Info", () => {
  assert.match(accountScreenSource, /useLanguage\(\)/);
  assert.match(accountScreenSource, /<AccountInfoPanel contentLang=\{workspaceContentLang\} \/>/);
});

test("Account Info open docs link uses workspace locale not docs preference", () => {
  assert.match(accountInfoSource, /workspaceDocsHomeUrl\(resolvedLang\)/);
});
