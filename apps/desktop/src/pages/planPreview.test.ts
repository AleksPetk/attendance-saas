import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error Production Workspace presentation contract.
import { buildUpgradePlanOptions, targetOfferPricing } from "../../../../frontend/src/subscriptionPlanOptions.js";
// @ts-expect-error Production Workspace entitlement contract.
import { subscriptionUsageRows } from "../../../../frontend/src/workspaceEntitlements.js";
// @ts-expect-error Canonical admin promotional content.
import { catalogPromotionalText } from "../../../../frontend/src/promotionalText.js";
import {
  appleProductIdFor,
  APPLE_PRODUCT_IDS,
  APPLE_PRODUCT_ID_LIST,
} from "../billing/appleProducts";
import { storeKitDisplayPriceOnly } from "../billing/storeKitDisplayPrice";
import {
  shouldShowStripePromoOnMas,
  applePurchaseEligible,
  appleStorePurchaseAllowed,
  appleManaged,
  isCurrentAppleSubscriptionProduct,
} from "../billing/applePlanUi";
import {
  buildApplePlanCards,
  shouldShowApplePlanCards,
} from "../billing/applePlanCards";
import {
  desktopBillingMode,
  desktopAppleAuthMode,
  resolveDesktopDistribution,
} from "../lib/desktopDistribution";

const here = dirname(fileURLToPath(import.meta.url));

test("DIRECT Plan page keeps Stripe checkout/portal; MAS branch uses Apple verify", () => {
  const source = readFileSync(join(here, "PlanPage.tsx"), "utf8");
  assert.match(source, /endpoints\.billingCheckout\(\)/);
  assert.match(source, /endpoints\.billingPortal\(\)/);
  assert.match(source, /desktop_return_url/);
  assert.match(source, /prepareBillingReturn/);
  assert.match(source, /openBillingReturn/);
  assert.match(source, /stripe_web/);
  assert.match(source, /apple_iap/);
  assert.match(source, /desktop-plan-purchase/);
  assert.match(source, /endpoints\.billingAppleVerify\(\)/);
  assert.match(source, /purchaseStoreKitSubscription/);
  assert.match(source, /restoreStoreKitPurchases/);
  assert.match(source, /openAppleManageSubscriptions/);
  assert.match(source, /storeKitDisplayPriceOnly/);
  assert.match(source, /shouldShowStripePromoOnMas/);
  assert.match(source, /buildApplePlanCards/);
  assert.match(source, /appleStorePurchaseAllowed/);
  // Stripe CTAs gated; Apple purchase gated separately.
  assert.match(source, /if \(!stripeEnabled \|\| busy\) return;/);
  assert.match(source, /if \(!appleIapEnabled \|\| busy\) return;/);
});

test("MAS never surfaces Stripe promo helpers as visible purchase price source", () => {
  assert.equal(shouldShowStripePromoOnMas({}), false);
  assert.equal(storeKitDisplayPriceOnly({ displayPrice: "¥1,200", price: 9.99 }), "¥1,200");
  assert.equal(storeKitDisplayPriceOnly({ price: 9.99 }), "");
  assert.equal(storeKitDisplayPriceOnly({ displayPrice: "  $9.99  " }), "$9.99");
});

test("Apple product IDs map exactly to ASC SKUs", () => {
  assert.equal(appleProductIdFor("plus", "monthly"), APPLE_PRODUCT_IDS.plusMonthly);
  assert.equal(appleProductIdFor("plus", "yearly"), APPLE_PRODUCT_IDS.plusYearly);
  assert.equal(appleProductIdFor("business", "monthly"), APPLE_PRODUCT_IDS.businessMonthly);
  assert.equal(appleProductIdFor("business", "yearly"), APPLE_PRODUCT_IDS.businessYearly);
  assert.deepEqual(APPLE_PRODUCT_ID_LIST, [
    "app.checkstation.plus.monthly",
    "app.checkstation.plus.yearly",
    "app.checkstation.business.monthly",
    "app.checkstation.business.yearly",
  ]);
});

test("distribution billing modes separate Stripe vs Apple IAP", () => {
  assert.equal(resolveDesktopDistribution("direct"), "direct");
  assert.equal(resolveDesktopDistribution("mas"), "mas");
  assert.equal(desktopBillingMode("direct"), "stripe_web");
  assert.equal(desktopBillingMode("mas"), "apple_iap");
  assert.equal(desktopAppleAuthMode("direct"), "web_compatible");
  assert.equal(desktopAppleAuthMode("mas"), "native");
});

test("apple purchase eligibility mirrors backend purchase_source gates", () => {
  assert.equal(
    applePurchaseEligible({
      purchase_source: "none",
      can_start_apple: true,
      managed_by_platform: false,
    }),
    true,
  );
  assert.equal(
    applePurchaseEligible({
      purchase_source: "stripe",
      can_start_apple: true,
    }),
    false,
  );
  assert.equal(
    appleStorePurchaseAllowed({
      purchase_source: "apple",
      can_manage_apple: true,
    }),
    true,
  );
  assert.equal(appleManaged({ purchase_source: "apple", can_manage_apple: true }), true);
  assert.equal(
    isCurrentAppleSubscriptionProduct(
      { purchase_source: "apple", subscribed_plan: { key: "plus" }, interval: "monthly" },
      "plus",
      "monthly",
    ),
    true,
  );
  assert.equal(shouldShowApplePlanCards({ purchase_source: "stripe" }), false);
  assert.equal(buildApplePlanCards({}, () => "").length, 4);
});

test("admin promotion text and exact prices are not desktop constants", () => {
  const catalog = {
    promotional_text: { enabled: true, text: "Admin edited headline" },
    plans: {
      plus: {
        intervals: {
          monthly: {
            formatted: "$9",
            promotion: {
              active: true,
              first_period_formatted: "$4",
              renews_at_formatted: "$9",
              discount_percent: 55,
              applies_to: "first_month",
            },
          },
        },
      },
    },
  };
  assert.equal(catalogPromotionalText(catalog), "Admin edited headline");
  assert.equal(targetOfferPricing({ catalog }, "plus", "monthly").firstPeriodFormatted, "$4");
  catalog.promotional_text.enabled = false;
  assert.equal(catalogPromotionalText(catalog), "");
});

test("Basic and included trial use the same canonical eligible card set", () => {
  const snapshot = {
    actions: { can_checkout_plus: true, can_checkout_business: true },
    status: "none",
    catalog: {},
  };
  const basic = buildUpgradePlanOptions(snapshot, "basic");
  const trial = buildUpgradePlanOptions(
    { ...snapshot, builtin_trial: { active: true }, effective_plan: { key: "business" } },
    "business",
  );
  assert.equal(basic.length, 4);
  assert.deepEqual(
    trial.map((o: { plan: string; interval: string }) => [o.plan, o.interval]),
    basic.map((o: { plan: string; interval: string }) => [o.plan, o.interval]),
  );
});

test("Usage comes from server limits and totals, including locked records", () => {
  const rows = subscriptionUsageRows({
    plan: { key: "business" },
    features: { staff_management: true },
    limits: { members: 300 },
    usage: { members: 7 },
    usage_totals: { members: 9 },
    plan_locks: { locked_counts: { members: 2 } },
  });
  const members = rows.find((r: { key: string }) => r.key === "members");
  assert.equal(members.usage, 9);
  assert.equal(members.limit, 300);
  assert.equal(members.locked, 2);
});
