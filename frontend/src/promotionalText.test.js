import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import {
  catalogPromotionalText,
  DEFAULT_PROMOTIONAL_TEXT_STYLE,
  PromotionalText,
  promotionalTextStyleKey,
} from "./promotionalText.js";

test("promotional text renders only when enabled with content", () => {
  assert.equal(catalogPromotionalText(null), "");
  assert.equal(
    catalogPromotionalText({
      promotional_text: { enabled: false, text: "100% OFF" },
    }),
    "",
  );
  assert.equal(
    catalogPromotionalText({ promotional_text: { enabled: true, text: "" } }),
    "",
  );
  assert.equal(
    catalogPromotionalText({ promotional_text: { enabled: true, text: "   " } }),
    "",
  );
  assert.equal(
    catalogPromotionalText({
      promotional_text: { enabled: true, text: "Autumn Sale" },
    }),
    "Autumn Sale",
  );
});

test("promotional text renderer emits copy with no disabled placeholder", () => {
  const enabled = renderToStaticMarkup(
    createElement(PromotionalText, {
      catalog: {
        promotional_text: {
          enabled: true,
          text: "100% OFF",
          style: { key: "halloween" },
        },
      },
      className: "prepared-area",
    }),
  );
  const disabled = renderToStaticMarkup(
    createElement(PromotionalText, {
      catalog: { promotional_text: { enabled: false, text: "100% OFF" } },
      className: "prepared-area",
    }),
  );

  assert.match(enabled, /class="prepared-area promotional-text-style-halloween"/);
  assert.match(enabled, /promotional-text-style-halloween/);
  assert.match(enabled, />100% OFF</);
  assert.equal(disabled, "");
});

test("promotional text styles accept all predefined keys with normal fallback", () => {
  assert.equal(DEFAULT_PROMOTIONAL_TEXT_STYLE, "normal");
  for (const key of [
    "normal",
    "spring",
    "summer",
    "autumn",
    "winter",
    "halloween",
    "christmas_new_year",
    "black_friday",
    "luxury_gold",
    "cyberpunk",
    "retro_sale",
    "dark_fantasy",
    "editorial",
    "impact_sale",
    "arcade",
  ]) {
    assert.equal(
      promotionalTextStyleKey({
        promotional_text: { style: { key } },
      }),
      key,
    );
  }
  assert.equal(promotionalTextStyleKey(null), "normal");
  assert.equal(
    promotionalTextStyleKey({ promotional_text: { style: { key: "unknown" } } }),
    "normal",
  );
});

test("promotional text does not inspect prices, promotions, or templates", () => {
  const catalog = {
    promotional_text: { enabled: true, text: "100% OFF" },
    pricing_template: { key: "normal" },
    promotion: { active: false, offers: [] },
    plans: { plus: { intervals: { monthly: { cents: 999 } } } },
  };
  const before = structuredClone(catalog);

  assert.equal(catalogPromotionalText(catalog), "100% OFF");
  assert.deepEqual(catalog, before);
});
