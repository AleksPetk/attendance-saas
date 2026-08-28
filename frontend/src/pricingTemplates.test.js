import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import PricingCardsLoadingState from "./PricingCardsLoadingState.js";
import {
  DEFAULT_PRICING_TEMPLATE,
  pricingTemplateClass,
  pricingTemplateKey,
} from "./pricingTemplates.js";

test("pricing templates default safely to normal", () => {
  assert.equal(DEFAULT_PRICING_TEMPLATE, "normal");
  assert.equal(pricingTemplateKey(null), "normal");
  assert.equal(pricingTemplateKey({}), "normal");
  assert.equal(pricingTemplateKey({ pricing_template: { key: "unknown" } }), "normal");
  assert.equal(pricingTemplateKey({ pricing_template: "unknown" }), "normal");
});

test("pricing templates accept all presentation variants", () => {
  for (const key of [
    "normal",
    "spring",
    "summer",
    "autumn",
    "winter",
    "halloween",
    "christmas_new_year",
    "black_friday",
  ]) {
    assert.equal(
      pricingTemplateClass({ pricing_template: { key } }),
      `pricing-template-${key}`,
    );
  }
});

test("template selection ignores neighboring price and promotion data", () => {
  const catalog = {
    pricing_template: { key: "autumn" },
    plans: { plus: { intervals: { monthly: { cents: 999 } } } },
    promotion: { active: true, mode: "normal" },
    entitlements: { plus: { limits: { members: 50 } } },
  };
  const before = structuredClone(catalog);

  assert.equal(pricingTemplateClass(catalog), "pricing-template-autumn");
  assert.deepEqual(catalog, before);
});

test("unresolved pricing presentation reserves card space without painting normal", () => {
  const html = renderToStaticMarkup(
    createElement(PricingCardsLoadingState, { cardCount: 3 }),
  );

  assert.match(html, /pricing-cards-loading/);
  assert.equal((html.match(/pricing-card-loading-placeholder/g) || []).length, 3);
  assert.doesNotMatch(html, /pricing-template-normal/);
  assert.doesNotMatch(html, /pricing-card(?:\s|\")/);
});
