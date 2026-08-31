import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const registerSource = readFileSync(new URL("./RegisterScreen.jsx", import.meta.url), "utf8");
const viewerSource = readFileSync(new URL("./RegistrationLegalViewer.jsx", import.meta.url), "utf8");

test("registration removes the permanent password requirements panel", () => {
  assert.doesNotMatch(registerSource, /password-requirements|Password requirements/);
  assert.match(registerSource, /error=\{fieldErrors\.password\}/);
});

test("registration requires and submits legal acknowledgement", () => {
  assert.match(registerSource, /legal_acknowledgement: legalAcknowledgement/);
  assert.match(registerSource, /disabled=\{loading \|\| !legalAcknowledgement\}/);
  assert.match(registerSource, /type="checkbox"[\s\S]*required/);
  assert.match(registerSource, /I agree to the/);
  assert.match(registerSource, /Terms of Use/);
  assert.match(registerSource, /Privacy Policy/);
});

test("legal links fetch canonical slugs without replacing form state", () => {
  assert.match(registerSource, /terms: "terms-of-use"/);
  assert.match(registerSource, /privacy: "privacy-policy"/);
  assert.match(registerSource, /api\.getContentDocument\(legalSlug\)/);
  assert.match(registerSource, /const \[email, setEmail\] = useState/);
  assert.match(registerSource, /onClose=\{\(\) => setLegalSlug\(""\)\}/);
  assert.doesNotMatch(registerSource, /onClose=\{[^}]*setEmail/);
});

test("registration legal viewer reuses the safe Markdown renderer", () => {
  assert.match(viewerSource, /ContentMarkdown/);
  assert.match(viewerSource, /stripLeadingDocumentTitle/);
  assert.doesNotMatch(viewerSource, /dangerouslySetInnerHTML/);
  assert.match(viewerSource, /internalDocumentHref/);
});

test("registration exposes google and apple oauth alternatives", () => {
  assert.match(registerSource, /AuthProviderButtons/);
  assert.match(registerSource, /intent="register"/);
  assert.match(registerSource, /legalAcknowledged=\{legalAcknowledgement\}/);
});
