/**
 * Run: node --test src/subscriptionPlanOptions.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDowngradePlanOptions,
  buildUpgradePlanOptions,
  isEffectiveCurrentPlanOption,
  targetOfferPricing,
} from "./subscriptionPlanOptions.js";

const catalog = {
  basic: { display_name: "Basic", formatted: "Free" },
  plans: {
    plus: {
      display_name: "Plus",
      intervals: {
        monthly: { formatted: "$9.99" },
        yearly: { formatted: "$99.90" },
      },
    },
    business: {
      display_name: "Business",
      intervals: {
        monthly: { formatted: "$14.99" },
        yearly: { formatted: "$149.90" },
      },
    },
  },
  promotion: {
    group: "plus_monthly",
    active: true,
    offers: [
      {
        id: "plus_monthly_to_plus_yearly",
        target_plan: "plus",
        target_interval: "yearly",
        discount_percent: 30,
        promotional_formatted: "$69.90",
        renews_at_formatted: "$99.90",
        label: "30% off first Plus Yearly payment",
        checkout_applies_promotion: true,
      },
      {
        id: "plus_monthly_to_business_yearly",
        target_plan: "business",
        target_interval: "yearly",
        discount_percent: 30,
        promotional_formatted: "$104.90",
        renews_at_formatted: "$149.90",
        label: "30% off first Business Yearly payment",
        checkout_applies_promotion: true,
      },
    ],
  },
};

function plusMonthlyBilling(overrides = {}) {
  return {
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    interval: "monthly",
    status: "active",
    catalog,
    actions: {
      can_upgrade_to_business: true,
      can_schedule_billing_change: true,
      can_change_interval: true,
      can_cancel: true,
      can_schedule_downgrade_to_plus: false,
      can_checkout_plus: false,
      can_checkout_business: false,
    },
    ...overrides,
  };
}

describe("isEffectiveCurrentPlanOption", () => {
  it("marks only Plus Monthly current when interval is monthly", () => {
    const billing = plusMonthlyBilling();
    assert.equal(isEffectiveCurrentPlanOption(billing, "plus", "monthly"), true);
    assert.equal(isEffectiveCurrentPlanOption(billing, "plus", "yearly"), false);
    assert.equal(isEffectiveCurrentPlanOption(billing, "business", "monthly"), false);
    assert.equal(isEffectiveCurrentPlanOption(billing, "business", "yearly"), false);
  });

  it("does not treat scheduled Business Yearly as current", () => {
    const billing = plusMonthlyBilling({
      pending_plan: "business",
      pending_interval: "yearly",
      scheduled_change: { active: true, kind: "combined" },
    });
    assert.equal(isEffectiveCurrentPlanOption(billing, "plus", "monthly"), true);
    assert.equal(isEffectiveCurrentPlanOption(billing, "business", "yearly"), false);
  });
});

describe("buildUpgradePlanOptions Plus Monthly", () => {
  it("shows promo yearly offers and Business Monthly upgrade without Basic", () => {
    const options = buildUpgradePlanOptions(plusMonthlyBilling());
    const ids = options.map((o) => o.id);
    assert.ok(ids.includes("plus_monthly_to_plus_yearly"));
    assert.ok(ids.includes("plus_monthly_to_business_yearly"));
    assert.ok(ids.includes("business-monthly-upgrade"));
    assert.equal(
      options.find((o) => o.id === "plus_monthly_to_plus_yearly").pricing.firstPeriodFormatted,
      "$69.90",
    );
    assert.equal(
      options.find((o) => o.id === "plus_monthly_to_business_yearly").pricing
        .firstPeriodFormatted,
      "$104.90",
    );
    assert.equal(options.some((o) => o.plan === "basic"), false);
    assert.equal(
      options.some((o) => o.plan === "plus" && o.interval === "monthly"),
      false,
    );
  });
});

describe("Business highest plan", () => {
  it("shows yearly switch for Business Monthly", () => {
    const billing = {
      effective_plan: { key: "business", display_name: "Business" },
      subscribed_plan: { key: "business", display_name: "Business" },
      interval: "monthly",
      status: "active",
      purchase_source: "stripe",
      catalog: {
        ...catalog,
        promotion: {
          group: "business_monthly",
          active: true,
          offers: [
            {
              id: "business_monthly_to_business_yearly",
              target_plan: "business",
              target_interval: "yearly",
              promotional_formatted: "$104.90",
              renews_at_formatted: "$149.90",
              label: "30% off first Business Yearly payment",
              discount_percent: 30,
              checkout_applies_promotion: true,
            },
          ],
        },
      },
      actions: {
        can_schedule_billing_change: true,
        can_change_interval: true,
        can_upgrade_to_business: false,
        can_cancel: true,
        can_schedule_downgrade_to_plus: true,
      },
    };
    const upgrades = buildUpgradePlanOptions(billing);
    assert.equal(upgrades.length, 1);
    assert.equal(upgrades[0].plan, "business");
    assert.equal(upgrades[0].interval, "yearly");
    assert.equal(upgrades[0].actionLabel, "Switch to Business Yearly");
    assert.equal(upgrades[0].pricing.firstPeriodFormatted, "$104.90");
    const downs = buildDowngradePlanOptions(billing);
    assert.ok(downs.some((o) => o.plan === "plus"));
    assert.ok(downs.some((o) => o.plan === "basic"));
  });
});

describe("targetOfferPricing", () => {
  it("reads exact backend promo amounts without percentage math", () => {
    const pricing = targetOfferPricing(plusMonthlyBilling(), "business", "yearly");
    assert.equal(pricing.firstPeriodFormatted, "$104.90");
    assert.notEqual(pricing.firstPeriodFormatted, "$74.95");
    assert.equal(pricing.renewsAtFormatted, "$149.90");
  });
});
