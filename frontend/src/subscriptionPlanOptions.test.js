/**
 * Run: node --test src/subscriptionPlanOptions.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDowngradePlanOptions,
  buildUpgradePlanOptions,
  isEffectiveCurrentPlanOption,
  isHighestPaidPlan,
  targetOfferPricing,
} from "./subscriptionPlanOptions.js";

const catalog = {
  basic: { display_name: "Basic", formatted: "Free" },
  plans: {
    plus: {
      display_name: "Plus",
      intervals: {
        monthly: { formatted: "$9.99" },
        yearly: { formatted: "$99.99" },
      },
    },
    business: {
      display_name: "Business",
      intervals: {
        monthly: { formatted: "$14.99" },
        yearly: { formatted: "$149.99" },
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
        promotional_formatted: "$69.99",
        renews_at_formatted: "$99.99",
        label: "30% off first Plus Yearly payment",
        checkout_applies_promotion: true,
      },
      {
        id: "plus_monthly_to_business_yearly",
        target_plan: "business",
        target_interval: "yearly",
        discount_percent: 30,
        promotional_formatted: "$104.99",
        renews_at_formatted: "$149.99",
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
      "$69.99",
    );
    assert.equal(
      options.find((o) => o.id === "plus_monthly_to_business_yearly").pricing
        .firstPeriodFormatted,
      "$104.99",
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
              promotional_formatted: "$104.99",
              renews_at_formatted: "$149.99",
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
    assert.equal(upgrades[0].pricing.firstPeriodFormatted, "$104.99");
    const downs = buildDowngradePlanOptions(billing);
    assert.ok(downs.some((o) => o.plan === "plus"));
    assert.ok(downs.some((o) => o.plan === "basic"));
  });
});

describe("isHighestPaidPlan uses subscribed plan not effective entitlement", () => {
  it("Business trial + subscribed Plus → no highest-plan message", () => {
    const billing = plusMonthlyBilling({
      effective_plan: { key: "business", display_name: "Business" },
      subscribed_plan: { key: "plus", display_name: "Plus" },
      status: "trialing",
      purchase_source: "stripe",
      builtin_trial: { active: true },
    });
    assert.equal(isHighestPaidPlan(billing), false);
    assert.equal(isHighestPaidPlan(billing, "business"), false);
    const upgrades = buildUpgradePlanOptions(billing);
    assert.ok(upgrades.some((o) => o.plan === "plus" && o.interval === "yearly"));
    assert.equal(upgrades.some((o) => o.id === "business-yearly-switch"), false);
  });

  it("Business trial + subscribed Business → highest-plan message allowed", () => {
    const billing = {
      effective_plan: { key: "business", display_name: "Business" },
      subscribed_plan: { key: "business", display_name: "Business" },
      interval: "monthly",
      status: "trialing",
      purchase_source: "stripe",
      builtin_trial: { active: true },
      catalog,
      actions: {
        can_schedule_billing_change: true,
        can_change_interval: true,
        can_upgrade_to_business: false,
        can_cancel: true,
        can_schedule_downgrade_to_plus: false,
      },
    };
    assert.equal(isHighestPaidPlan(billing), true);
    assert.equal(isHighestPaidPlan(billing, "business"), true);
  });

  it("paid Business outside trial → highest-plan message", () => {
    const billing = {
      effective_plan: { key: "business", display_name: "Business" },
      subscribed_plan: { key: "business", display_name: "Business" },
      interval: "yearly",
      status: "active",
      purchase_source: "stripe",
      builtin_trial: { active: false },
      catalog,
      actions: {},
    };
    assert.equal(isHighestPaidPlan(billing), true);
  });

  it("Plus outside trial → no highest-plan message", () => {
    assert.equal(isHighestPaidPlan(plusMonthlyBilling()), false);
  });

  it("built-in Business trial alone (no subscribed plan) → no highest-plan message", () => {
    const billing = {
      effective_plan: { key: "business", display_name: "Business" },
      subscribed_plan: { key: null, display_name: null },
      interval: null,
      status: "none",
      purchase_source: "none",
      builtin_trial: { active: true },
      catalog,
      actions: {
        can_checkout_plus: true,
        can_checkout_business: true,
      },
    };
    assert.equal(isHighestPaidPlan(billing), false);
    assert.equal(isHighestPaidPlan(billing, "business"), false);
  });
});

describe("targetOfferPricing", () => {
  it("reads exact backend promo amounts without percentage math", () => {
    const pricing = targetOfferPricing(plusMonthlyBilling(), "business", "yearly");
    assert.equal(pricing.firstPeriodFormatted, "$104.99");
    assert.notEqual(pricing.firstPeriodFormatted, "$74.95");
    assert.equal(pricing.renewsAtFormatted, "$149.99");
  });

  it("renders JPY catalog values without deriving currency from UI language", () => {
    const billing = {
      catalog: {
        market: "jp",
        currency: "jpy",
        plans: {
          plus: {
            intervals: {
              yearly: {
                amount_minor: 9800,
                formatted: "¥9,800",
                promotion: {
                  active: true,
                  first_period_amount_minor: 6900,
                  first_period_formatted: "¥6,900",
                  renews_at_formatted: "¥9,800",
                  applies_to: "first_year",
                  discount_percent: 30,
                  checkout_applies_promotion: true,
                },
              },
            },
          },
        },
        promotion: { offers: [] },
      },
    };
    const pricing = targetOfferPricing(billing, "plus", "yearly");
    assert.equal(pricing.firstPeriodFormatted, "¥6,900");
    assert.equal(pricing.renewsAtFormatted, "¥9,800");
  });
});
