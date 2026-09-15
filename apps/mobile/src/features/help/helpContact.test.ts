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
import { contactCatalogLabel, mobileContactSubject } from "./contactCatalogLabels";

const helpHub = readFileSync(fileURLToPath(new URL("../../../app/(app)/help.tsx", import.meta.url)), "utf8");
const contactScreen = readFileSync(
  fileURLToPath(new URL("../../../app/(app)/help/contact.tsx", import.meta.url)),
  "utf8",
);
const layout = readFileSync(fileURLToPath(new URL("../../../app/(app)/_layout.tsx", import.meta.url)), "utf8");
const contactPanel = readFileSync(fileURLToPath(new URL("./MobileHelpContact.tsx", import.meta.url)), "utf8");
const helpContact = readFileSync(fileURLToPath(new URL("./helpContact.ts", import.meta.url)), "utf8");

test("Contact appears in Help section and opens dedicated screen", () => {
  assert.match(helpHub, /help\.contact\.title/);
  assert.match(helpHub, /testID="help-contact-entry"/);
  assert.match(helpHub, /router\.push\("\/\(app\)\/help\/contact"\)/);
  assert.match(helpHub, /slug === "support" \|\| row\.slug === "faq"/);
  assert.match(layout, /name="help\/contact"/);
  assert.match(contactScreen, /MobileHelpContact/);
  assert.match(helpHub, /help\.guided/);
  assert.match(helpHub, /help\.serviceStatus/);
  assert.match(helpHub, /openDocument/);
});

test("category list loads and subcategory follows category", () => {
  assert.match(contactPanel, /getContactCategories/);
  assert.match(contactPanel, /setSubcategoryId\(""\)/);
  assert.match(contactPanel, /category\?\.subcategories/);
  assert.match(helpContact, /endpoints\.contactCategories\(\)/);
});

test("suggested answers load with Mobile app locale as lang", () => {
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
  assert.match(contactPanel, /accessibilityState=\{\{\s*expanded:\s*open\s*\}\}/);
  assert.match(contactPanel, /current === item\.slug \? "" : item\.slug/);
});

test("English and Japanese Mobile render catalog labels in the active language", () => {
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
  assert.match(contactPanel, /editable=\{false\}/);
  assert.match(contactPanel, /testID="help-contact-email"/);
  assert.match(contactScreen, /workspace\?\.identity/);
  assert.doesNotMatch(contactPanel, /turnstile|captcha|Turnstile/i);
  assert.doesNotMatch(helpContact, /turnstile|captcha/i);
});

test("subject follows Category/Subcategory mapping", () => {
  assert.equal(
    mobileContactSubject("en", "kiosk", "Kiosk", "cannot_launch", "Cannot launch kiosk"),
    "Kiosk: Cannot launch kiosk",
  );
  assert.equal(
    mobileContactSubject("ja", "kiosk", "Kiosk", "cannot_launch", "Cannot launch kiosk"),
    `${contactCatalogLabel("ja", "kiosk")}: ${contactCatalogLabel("ja", "cannot_launch")}`,
  );
  assert.equal(suggestedSubject("A", "B").length <= SUBJECT_MAX, true);
  assert.match(contactPanel, /suggestedSubject\(/);
  assert.match(contactPanel, /contactCatalogLabel\(locale/);
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

test("API failure does not crash Contact and allows retry", () => {
  assert.match(contactPanel, /help\.contact\.loadError/);
  assert.match(contactPanel, /help\.contact\.suggestionsError/);
  assert.match(contactPanel, /common\.retry/);
  assert.match(contactPanel, /setCatalogRetry/);
  assert.match(contactPanel, /setCategories\(\[\]\)/);
  assert.match(contactPanel, /setSuggestions\(\[\]\)/);
});

test("keyboard and scroll layout keep message and Send reachable", () => {
  assert.match(contactPanel, /keyboardWillShow|keyboardDidShow/);
  assert.match(contactPanel, /keyboardHeight/);
  assert.match(contactPanel, /contentBottomPad/);
  assert.match(contactPanel, /keyboardDismissMode="none"/);
  assert.match(contactPanel, /keyboardShouldPersistTaps="handled"/);
  assert.match(contactPanel, /help\.contact\.submit/);
  assert.doesNotMatch(contactPanel, /scrollTo\(\{\s*y:\s*Math\.max/);
  assert.doesNotMatch(contactPanel, /messageY/);
});
