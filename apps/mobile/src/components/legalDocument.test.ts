import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { legalSlugFromHref } from "../lib/legalDocuments.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test("legal document links stay on the existing content slugs", () => {
  assert.equal(legalSlugFromHref("terms-of-use"), "terms-of-use");
  assert.equal(legalSlugFromHref("/privacy-policy"), "privacy-policy");
  assert.equal(legalSlugFromHref("https://checkstation.app/terms-of-use"), "terms-of-use");
  assert.equal(legalSlugFromHref("https://example.com/help"), null);
});

test("registration does not open legal documents in an external browser", () => {
  const source = readFileSync(resolve(root, "apps/mobile/app/(auth)/register.tsx"), "utf8");
  assert.equal(source.includes("Linking.openURL"), false);
  assert.equal(source.includes("checkstation.app"), false);
  assert.match(source, /openLegal\("terms-of-use"\)/);
  assert.match(source, /openLegal\("privacy-policy"\)/);
  assert.match(source, /LegalDocumentModal/);
});

test("mobile auth reuses the browser Google mark and separate secondary actions", () => {
  const ui = readFileSync(resolve(root, "apps/mobile/src/components/ui.tsx"), "utf8");
  const signIn = readFileSync(resolve(root, "apps/mobile/app/(auth)/sign-in.tsx"), "utf8");
  const staff = readFileSync(resolve(root, "apps/mobile/app/(auth)/staff-sign-in.tsx"), "utf8");
  assert.equal(existsSync(resolve(root, "frontend/src/assets/auth/google-g.png")), true);
  assert.match(ui, /frontend\/src\/assets\/auth\/google-g\.png/);
  assert.equal(ui.includes("logo-google"), false);
  assert.equal(signIn.includes("auth.staffPrompt"), false);
  assert.equal(signIn.includes("auth.newHere"), false);
  assert.match(signIn, /auth\.staffSignIn/);
  assert.match(signIn, /auth\.createAccount/);
  assert.equal(staff.includes("auth.ownerPrompt"), false);
  assert.match(staff, /auth\.backToCustomerLogin/);
});
