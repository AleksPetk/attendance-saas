import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { pricingTemplateKey } from "../../../../frontend/src/pricingTemplates.js";
import { catalogPromotionalText, promotionalTextStyleKey } from "../../../../frontend/src/promotionalText.js";
import { planCardPresentation, promotionalHeadlinePresentation, pricingPresentationCardKeys, pricingPresentationPromoKeys } from "../../../../frontend/src/pricingPresentation.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("mobile Plan presentation follows the admin template and promo style keys", () => {
  const page = read("apps/mobile/app/(app)/plan.tsx");
  const view = read("apps/mobile/src/components/PlanPresentation.tsx");
  assert.match(page, /PlanPromoHeadline/);
  assert.match(page, /PlanOptionCard/);
  assert.doesNotMatch(page, /Launch Special/);
  assert.doesNotMatch(view, /Launch Special/);
  assert.match(view, /accessibilityState=\{\{ disabled: true \}\}/);
  assert.doesNotMatch(view, /Linking|StoreKit|checkout|onPress=/);
  assert.match(view, /pricingPresentation\.js/);
});

test("card and promo presentation stay on the Workspace template catalogs", () => {
  const css = read("apps/desktop/src/pages/planPreview.css");
  for (const key of ["normal", "spring", "summer", "autumn", "winter", "halloween", "christmas_new_year", "black_friday"]) {
    assert.equal(pricingTemplateKey({ pricing_template: { key } }), key);
    assert.equal(planCardPresentation({ pricing_template: { key } }).key, key);
    if (key !== "normal") assert.match(css, new RegExp(`pricing-template-${key}`));
  }
  assert.deepEqual(pricingPresentationCardKeys, ["normal", "spring", "summer", "autumn", "winter", "halloween", "christmas_new_year", "black_friday"]);
  for (const key of pricingPresentationPromoKeys) {
    assert.equal(promotionalTextStyleKey({ promotional_text: { style: { key } } }), key);
  }
  assert.match(css, /#c25787/);
  assert.match(css, /#100b17/);
});

test("promo headline and card colors follow admin settings, not a mobile theme", () => {
  const catalog = {
    pricing_template: { key: "halloween" },
    promotional_text: { enabled: true, text: "Admin edited headline", style: { key: "cyberpunk" } },
  };
  assert.equal(promotionalHeadlinePresentation(catalog).text, "Admin edited headline");
  assert.equal(promotionalHeadlinePresentation(catalog).key, "cyberpunk");
  assert.equal(promotionalHeadlinePresentation(catalog).textTransform, "uppercase");
  assert.equal(planCardPresentation(catalog, { recommended: true }).background[0], "#120b1b");
  catalog.promotional_text.enabled = false;
  assert.equal(catalogPromotionalText(catalog), "");
  assert.equal(promotionalHeadlinePresentation(catalog).text, "");
  assert.equal(planCardPresentation({ pricing_template: { key: "normal" } }).background[0], "#f1f5f9");
});
