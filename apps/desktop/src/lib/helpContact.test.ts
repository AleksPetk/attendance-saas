import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { endpoints } from "@checkstation/api";
import {
  HONEYPOT_FIELD,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUBJECT_MAX,
  suggestedSubject,
} from "@checkstation/domain";
import { createTranslator } from "@checkstation/i18n";
import { contactCatalogLabel, desktopContactSubject } from "./contactCatalogLabels";

const helpPage = readFileSync(fileURLToPath(new URL("../pages/HelpPage.tsx", import.meta.url)), "utf8");
const contactPanel = readFileSync(
  fileURLToPath(new URL("../components/DesktopHelpContact.tsx", import.meta.url)),
  "utf8",
);
const helpContact = readFileSync(fileURLToPath(new URL("./helpContact.ts", import.meta.url)), "utf8");
const styles = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

test("Contact tab appears to the right of System status", () => {
  assert.match(
    helpPage,
    /value: "status"[\s\S]*value: "contact"[\s\S]*help\.contact\.title/,
  );
  const statusIdx = helpPage.indexOf('value: "status"');
  const contactIdx = helpPage.indexOf('value: "contact"');
  assert.ok(statusIdx > 0 && contactIdx > statusIdx);
});

test("existing Help tabs remain wired", () => {
  for (const view of ["guided", "resources", "faq", "status", "contact"]) {
    assert.match(helpPage, new RegExp(`value: "${view}"`));
  }
  assert.match(helpPage, /DesktopGuidedHelp/);
  assert.match(helpPage, /<Resources /);
  assert.match(helpPage, /<FaqView/);
  assert.match(helpPage, /<StatusView/);
  assert.match(helpPage, /<DesktopHelpContact/);
});

test("category list and subcategory dependency use contact categories API", () => {
  assert.match(contactPanel, /getContactCategories/);
  assert.match(contactPanel, /setSubcategoryId\(""\)/);
  assert.match(contactPanel, /category\?\.subcategories/);
  assert.match(helpContact, /endpoints\.contactCategories\(\)/);
});

test("suggested answers load for selected topic with Desktop locale lang", () => {
  assert.match(
    contactPanel,
    /getContactSuggestions\(api, categoryId, subcategoryId, locale\)/,
  );
  assert.match(helpContact, /endpoints\.contactSuggestions\(category, subcategory, lang\)/);
  assert.equal(
    endpoints.contactSuggestions("kiosk", "cannot_launch", "ja"),
    "/contact/suggestions/?category=kiosk&subcategory=cannot_launch&lang=ja",
  );
  assert.equal(
    endpoints.contactSuggestions("kiosk", "cannot_launch", "en"),
    "/contact/suggestions/?category=kiosk&subcategory=cannot_launch&lang=en",
  );
});

test("FAQ rows expand and collapse", () => {
  assert.match(contactPanel, /aria-expanded=\{open\}/);
  assert.match(contactPanel, /current === item\.slug \? "" : item\.slug/);
  assert.match(styles, /\.help-contact-help-question/);
});

test("English and Japanese Desktop render catalog labels in the active language", () => {
  assert.equal(contactCatalogLabel("en", "kiosk"), "Kiosk");
  assert.equal(contactCatalogLabel("ja", "kiosk"), "キオスク");
  assert.equal(contactCatalogLabel("en", "cannot_launch"), "Cannot launch kiosk");
  assert.equal(contactCatalogLabel("ja", "cannot_launch"), "キオスクを起動できない");
  const en = createTranslator("en");
  const ja = createTranslator("ja");
  assert.equal(en("help.contact.title"), "Contact");
  assert.equal(ja("help.contact.title"), "お問い合わせ");
  assert.equal(en("help.contact.helpTitle"), "Suggested answers");
  assert.equal(ja("help.contact.helpTitle"), "おすすめの回答");
});

test("authenticated email is used and CAPTCHA is not required", () => {
  assert.match(contactPanel, /emailHint/);
  assert.match(contactPanel, /endpoints\.account\(\)/);
  assert.match(contactPanel, /readOnly/);
  assert.match(contactPanel, /data-testid="help-contact-email"/);
  assert.doesNotMatch(contactPanel, /turnstile|captcha|Turnstile/i);
  assert.doesNotMatch(helpContact, /turnstile|captcha/i);
});

test("subject follows Category/Subcategory mapping", () => {
  assert.equal(
    desktopContactSubject("en", "kiosk", "Kiosk", "cannot_launch", "Cannot launch kiosk"),
    "Kiosk: Cannot launch kiosk",
  );
  assert.equal(
    desktopContactSubject("ja", "kiosk", "Kiosk", "cannot_launch", "Cannot launch kiosk"),
    `${contactCatalogLabel("ja", "kiosk")}: ${contactCatalogLabel("ja", "cannot_launch")}`,
  );
  assert.equal(suggestedSubject("A", "B").length <= SUBJECT_MAX, true);
});

test("message sends through existing authenticated workspace contact endpoint", () => {
  assert.equal(endpoints.contactWorkspace(), "/contact/workspace/");
  assert.match(helpContact, /endpoints\.contactWorkspace\(\)/);
  assert.match(contactPanel, /submitWorkspaceContact/);
  assert.match(contactPanel, /page_path: "\/help\/contact"/);
  assert.match(contactPanel, /\[HONEYPOT_FIELD\]: honeypot/);
  assert.equal(HONEYPOT_FIELD, "company_url");
  assert.equal(MESSAGE_MIN, 20);
  assert.equal(MESSAGE_MAX, 4000);
});

test("success/reference state and send another reset", () => {
  assert.match(contactPanel, /help\.contact\.successSent/);
  assert.match(contactPanel, /help\.contact\.reference/);
  assert.match(contactPanel, /help\.contact\.sendAnother/);
  assert.match(contactPanel, /setSuccess\(null\)/);
  assert.match(contactPanel, /resetForm\(\)/);
});

test("API failure does not crash Help and allows retry", () => {
  assert.match(contactPanel, /help\.contact\.loadError/);
  assert.match(contactPanel, /help\.contact\.suggestionsError/);
  assert.match(contactPanel, /common\.retry/);
  assert.match(contactPanel, /setCatalogRetry/);
  assert.match(contactPanel, /setCategories\(\[\]\)/);
  assert.match(contactPanel, /setSuggestions\(\[\]\)/);
});
