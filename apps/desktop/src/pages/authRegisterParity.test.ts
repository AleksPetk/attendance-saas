import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "AuthAccountFlowPage.tsx"), "utf8");
const layout = readFileSync(join(here, "../components/AuthLayout.tsx"), "utf8");
const visual = readFileSync(join(here, "../components/RegistrationVisual.tsx"), "utf8");
const legal = readFileSync(join(here, "../components/DesktopLegalDocumentModal.tsx"), "utf8");
const help = readFileSync(join(here, "../lib/help.ts"), "utf8");
const i18n = readFileSync(join(here, "../../../../packages/i18n/src/index.ts"), "utf8");

test("desktop register uses registration promotional panel, not login promo", () => {
  assert.match(page, /RegistrationVisual/);
  assert.match(page, /visualContent=\{register \? <RegistrationVisual/);
  assert.match(visual, /auth\.register\.visual\.headline/);
  assert.match(layout, /visualContent/);
  assert.match(layout, /dashboard\.description/);
});

test("desktop register consent opens live legal documents inside the app", () => {
  assert.match(page, /LEGAL_DOCUMENTS\.terms/);
  assert.match(page, /LEGAL_DOCUMENTS\.privacy/);
  assert.match(page, /DesktopLegalDocumentModal/);
  assert.match(legal, /getDocument/);
  assert.match(help, /\/content\/documents\/\$\{encodeURIComponent\(slug\)\}\//);
  assert.doesNotMatch(page, /docs\.checkstation\.app/);
  assert.doesNotMatch(legal, /docs\.checkstation\.app/);
  assert.doesNotMatch(legal, /window\.open|location\.assign/);
});

test("desktop register shows Google via shared native completion without browser OAuth redirects", () => {
  assert.match(page, /DesktopAuthProviderButtons/);
  assert.match(page, /divider/);
  assert.match(page, /intent="register"/);
  const buttons = readFileSync(join(here, "../components/DesktopAuthProviderButtons.tsx"), "utf8");
  assert.match(buttons, /completeGoogleNative/);
  assert.match(buttons, /completeDesktopAuthHandoff/);
  assert.doesNotMatch(buttons, /oauthPublicStartUrl/);
});

test("desktop register uses Terms of Service terminology and shared consent copy", () => {
  assert.match(i18n, /"auth\.terms": "Terms of Service"/);
  assert.match(page, /auth\.legalAgree/);
  assert.match(page, /auth\.legalAcknowledge/);
  assert.match(page, /auth\.terms/);
  assert.match(page, /auth\.privacy/);
});
